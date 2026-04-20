from fastapi import APIRouter, Depends, Query as FastAPIQuery
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.review import SubmitReviewRequest, RejectTaskRequest, CompleteReviewRequest, CreateAnnotationRequest
from app.services.review_service import submit_review_decisions
from app.services.task_service import transition_task_status
from app.services.complete_service import complete_review_task
from app.services.annotation_service import create_annotation, list_annotations
from app.api.deps import get_current_user
from app.models.user import User, UserRole
from app.core.errors import raise_error
from app.workflow.graph import get_review_graph

router = APIRouter(prefix="/tasks", tags=["review"])


@router.post("/{task_id}/operations")
def submit_operations(task_id: str, req: SubmitReviewRequest,
                      db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # MVP 联调阶段：暂时绕过 reviewer 角色限制，允许任意登录用户提交审核决策
    # TODO: 生产环境需恢复: if current_user.role != UserRole.reviewer: raise_error("NOT_ASSIGNED_REVIEWER")
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


@router.post("/{task_id}/complete")
def complete_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    graph = get_review_graph()
    result = complete_review_task(db, task_id, current_user.id, graph)
    return {"code": 0, "message": "success", "data": result}


@router.post("/{task_id}/annotations", status_code=201)
def create_task_annotation(
    task_id: str,
    req: CreateAnnotationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ann = create_annotation(db, task_id, req.risk_item_id, current_user.id, req.content)
    return {"code": 0, "message": "success", "data": {
        "annotation_id": ann.id,
        "review_task_id": ann.task_id,
        "risk_item_id": ann.risk_item_id,
        "operator_id": ann.author_id,
        "content": ann.content,
        "created_at": ann.created_at.isoformat() if ann.created_at else None,
    }}


@router.get("/{task_id}/annotations")
def get_task_annotations(
    task_id: str,
    risk_item_id: str = FastAPIQuery(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    anns = list_annotations(db, task_id, risk_item_id)
    return {"code": 0, "message": "success", "data": {
        "items": [{
            "id": a.id,
            "review_task_id": a.task_id,
            "risk_item_id": a.risk_item_id,
            "operator_id": a.author_id,
            "content": a.content,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        } for a in anns],
        "total": len(anns),
    }}
