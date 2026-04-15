from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.review import SubmitReviewRequest, RejectTaskRequest
from app.services.review_service import submit_review_decisions
from app.services.task_service import transition_task_status
from app.api.deps import get_current_user
from app.models.user import User, UserRole
from app.core.errors import raise_error
from app.workflow.graph import get_review_graph

router = APIRouter(prefix="/tasks", tags=["review"])


@router.post("/{task_id}/operations")
def submit_operations(task_id: str, req: SubmitReviewRequest,
                      db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.reviewer:
        raise_error("NOT_ASSIGNED_REVIEWER")
    graph = get_review_graph()
    result = submit_review_decisions(db, task_id,
                                     [d.model_dump() for d in req.decisions],
                                     current_user.id, graph)
    return {"code": 0, "message": "success", "data": result}


@router.post("/{task_id}/reject")
def reject_task(task_id: str, req: RejectTaskRequest,
                db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    task = transition_task_status(db, task_id, "rejected", actor_type="human")
    return {"code": 0, "message": "success", "data": {"task_id": task.id, "status": "rejected"}}


@router.post("/{task_id}/debug/trigger-workflow")
def debug_trigger_workflow(task_id: str, db: Session = Depends(get_db),
                           _: User = Depends(get_current_user)):
    """MVP 调试：绕过 Celery 直接触发工作流"""
    from app.models.review_task import ReviewTask
    from app.models.document import Document
    from app.workflow.graph import get_review_graph

    task = db.query(ReviewTask).filter(ReviewTask.id == task_id).first()
    if not task:
        raise_error("TASK_NOT_FOUND")
    doc = db.query(Document).filter(Document.id == task.document_id).first()

    graph = get_review_graph()
    initial_state = {
        "document_id": task.document_id, "review_task_id": task_id,
        "current_status": "parsing", "document_content": "",
        "document_metadata": {"filename": doc.original_filename if doc else "test.pdf",
                               "file_type": "", "page_count": 0, "ocr_quality_score": 0.0},
        "risk_items": [], "human_reviews": [], "assigned_reviewer_id": None,
        "vector_db_version": "v1.0.0", "decision_log": [], "completed_at": None,
    }
    thread_id = f"review-task-{task_id}"
    result = graph.invoke(initial_state, config={"configurable": {"thread_id": thread_id}})
    return {"code": 0, "message": "success", "data": {
        "task_id": task_id,
        "final_status": result.get("current_status"),
        "risk_items_count": len(result.get("risk_items", [])),
        "thread_id": thread_id,
    }}
