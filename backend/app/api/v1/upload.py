import asyncio
import logging
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.db.session import get_db, SessionLocal
from app.schemas.upload import UploadInitRequest, UploadCompleteRequest
from app.services.upload_service import init_upload, complete_upload
from app.services.task_service import create_task_and_document, sync_workflow_to_db
from app.api.deps import get_current_user
from app.models.user import User
from app.websocket.manager import ws_manager
from app.websocket.events import (
    parse_progress_event, parse_complete_event,
    parse_failed_event, auto_review_progress_event,
    hitl_required_event, review_completed_event,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/upload", tags=["upload"])


async def _run_workflow_background(task_id: str, document_id: str, filename: str) -> None:
    """
    后台异步执行 LangGraph 工作流并通过 WebSocket 推送进度事件。
    DB 使用独立 Session（不能复用请求 Session）。
    """
    # 等待 WebSocket 客户端连接（最多等 3 秒），避免事件在连接前被发送丢失
    for _ in range(30):
        if ws_manager.get_connection_count(task_id) > 0:
            break
        await asyncio.sleep(0.1)

    await ws_manager.send_event(task_id, parse_progress_event(task_id, 10))

    def _invoke():
        from app.workflow.graph import get_review_graph
        graph = get_review_graph()
        initial_state = {
            "document_id": document_id,
            "review_task_id": task_id,
            "current_status": "parsing",
            "document_content": "",
            "document_metadata": {
                "filename": filename,
                "file_type": "", "page_count": 0, "ocr_quality_score": 0.0,
            },
            "risk_items": [], "human_reviews": [], "assigned_reviewer_id": None,
            "vector_db_version": "v1.0.0", "decision_log": [], "completed_at": None,
        }
        thread_id = f"review-task-{task_id}"
        return graph.invoke(initial_state, config={"configurable": {"thread_id": thread_id}})

    try:
        await ws_manager.send_event(task_id, parse_progress_event(task_id, 30))

        loop = asyncio.get_event_loop()
        workflow_result = await loop.run_in_executor(None, _invoke)

        await ws_manager.send_event(task_id, parse_progress_event(task_id, 70))

        # 同步写入 DB
        db = SessionLocal()
        try:
            sync_workflow_to_db(db, task_id, workflow_result)
        finally:
            db.close()

        final_status = workflow_result.get("current_status", "completed")
        risk_items = workflow_result.get("risk_items", [])

        await ws_manager.send_event(task_id, auto_review_progress_event(task_id, 3))
        await ws_manager.send_event(task_id, parse_complete_event(task_id))

        if final_status == "human_reviewing":
            await ws_manager.send_event(
                task_id,
                hitl_required_event(task_id, "reviewer-001", len(risk_items))
            )
        else:
            overall_score = sum({"critical": 100, "high": 75, "medium": 50, "low": 25}.get(
                i.get("risk_level", "low"), 25) for i in risk_items) / max(len(risk_items), 1)
            await ws_manager.send_event(task_id, review_completed_event(task_id, overall_score))

    except Exception as e:
        logger.error(f"工作流后台执行失败 task_id={task_id}: {e}")
        await ws_manager.send_event(task_id, parse_failed_event(task_id, str(e)))
        db = SessionLocal()
        try:
            from app.models.review_task import ReviewTask, TaskStatus
            task = db.query(ReviewTask).filter(ReviewTask.id == task_id).first()
            if task:
                task.status = TaskStatus.parse_failed
                db.commit()
        except Exception:
            pass
        finally:
            db.close()


@router.post("/init", status_code=201)
def upload_init(req: UploadInitRequest, current_user: User = Depends(get_current_user)):
    return {"code": 0, "message": "success", "data": init_upload(
        req.original_filename, req.file_size_bytes, req.total_parts, req.content_type)}


@router.post("/complete", status_code=201)
async def upload_complete(
    req: UploadCompleteRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_data = complete_upload(req.chunk_upload_id, req.parts)
    result = create_task_and_document(db, file_data, current_user.id)

    # 立即返回 task_id，工作流在后台异步执行并通过 WebSocket 推送进度
    background_tasks.add_task(
        _run_workflow_background,
        result["task_id"],
        result["document_id"],
        file_data["filename"],
    )

    return {"code": 0, "message": "success", "data": {
        "document_id": result["document_id"],
        "task_id": result["task_id"],
        "original_filename": file_data["filename"],
        "file_size_bytes": file_data["file_size_bytes"],
        "status": "uploaded",
    }}
