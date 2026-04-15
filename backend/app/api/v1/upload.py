from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.upload import UploadInitRequest, UploadCompleteRequest
from app.services.upload_service import init_upload, complete_upload
from app.services.task_service import create_task_and_document
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/upload", tags=["upload"])


@router.post("/init", status_code=201)
def upload_init(req: UploadInitRequest, current_user: User = Depends(get_current_user)):
    return {"code": 0, "message": "success", "data": init_upload(
        req.original_filename, req.file_size_bytes, req.total_parts, req.content_type)}


@router.post("/complete", status_code=201)
def upload_complete(req: UploadCompleteRequest, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    file_data = complete_upload(req.chunk_upload_id, req.parts)
    result = create_task_and_document(db, file_data, current_user.id)

    # 触发工作流（MVP：直接调用，不经 Celery）
    try:
        from app.workflow.graph import get_review_graph
        graph = get_review_graph()
        initial_state = {
            "document_id": result["document_id"],
            "review_task_id": result["task_id"],
            "current_status": "parsing",
            "document_content": "",
            "document_metadata": {"filename": file_data["filename"],
                                   "file_type": "", "page_count": 0, "ocr_quality_score": 0.0},
            "risk_items": [], "human_reviews": [], "assigned_reviewer_id": None,
            "vector_db_version": "v1.0.0", "decision_log": [], "completed_at": None,
        }
        thread_id = f"review-task-{result['task_id']}"
        graph.invoke(initial_state, config={"configurable": {"thread_id": thread_id}})
    except Exception:
        pass  # MVP：工作流异常不阻塞上传响应

    return {"code": 0, "message": "success", "data": {
        "document_id": result["document_id"],
        "task_id": result["task_id"],
        "original_filename": file_data["filename"],
        "file_size_bytes": file_data["file_size_bytes"],
        "status": "uploaded",
    }}
