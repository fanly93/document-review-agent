from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.review_task import ReviewTask, TaskStatus
from app.models.document import Document
from app.models.risk_item import RiskItem
from app.models.audit_log import AuditLog
from app.api.deps import get_current_user
from app.models.user import User
from app.core.errors import raise_error

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/{task_id}")
def get_task(task_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    task = db.query(ReviewTask).filter(ReviewTask.id == task_id).first()
    if not task:
        raise_error("TASK_NOT_FOUND")
    doc = db.query(Document).filter(Document.id == task.document_id).first()
    items = db.query(RiskItem).filter(RiskItem.task_id == task_id).all()

    review_result = None
    if task.status.value in ("auto_reviewed", "human_reviewing", "completed"):
        review_result = {
            "overall_risk_score": task.overall_risk_score,
            "risk_level_summary": task.risk_level_summary,
            "critical_count": sum(1 for i in items if i.risk_level == "critical"),
            "high_count": sum(1 for i in items if i.risk_level == "high"),
            "medium_count": sum(1 for i in items if i.risk_level == "medium"),
            "low_count": sum(1 for i in items if i.risk_level == "low"),
            "generated_at": task.updated_at.isoformat() if task.updated_at else None,
        }

    return {"code": 0, "message": "success", "data": {
        "task": {"id": task.id, "status": task.status.value,
                 "assigned_reviewer_id": task.assigned_user_id,
                 "sla_deadline": task.sla_deadline.isoformat() if task.sla_deadline else None,
                 "completed_at": task.completed_at.isoformat() if task.completed_at else None,
                 "created_at": task.created_at.isoformat()},
        "document": {"id": doc.id if doc else None,
                     "original_filename": doc.original_filename if doc else "",
                     "file_size_bytes": doc.file_size_bytes if doc else 0,
                     "ocr_quality_level": doc.ocr_quality_level if doc else None,
                     "ocr_quality_score": doc.ocr_quality_score if doc else None,
                     "document_type": doc.document_type if doc else None,
                     "block_reason": doc.block_reason if doc else None},
        "review_result": review_result,
    }}


@router.get("/{task_id}/risk-items")
def get_risk_items(task_id: str, risk_level: str = Query(None),
                   page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
                   db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if not db.query(ReviewTask).filter(ReviewTask.id == task_id).first():
        raise_error("TASK_NOT_FOUND")
    q = db.query(RiskItem).filter(RiskItem.task_id == task_id)
    if risk_level:
        q = q.filter(RiskItem.risk_level.in_([l.strip() for l in risk_level.split(",")]))
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return {"code": 0, "message": "success", "data": {
        "items": [{"id": i.id, "task_id": i.task_id, "risk_type": i.risk_type,
                   "risk_level": i.risk_level, "risk_description": i.risk_description,
                   "confidence_score": i.confidence_score, "confidence_category": i.confidence_category,
                   "reviewer_status": i.reviewer_status,
                   "source_references": i.source_references_json or []} for i in items],
        "total": total, "page": page, "page_size": page_size,
    }}


@router.get("/{task_id}/audit-logs")
def get_audit_logs(task_id: str, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                   db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if not db.query(ReviewTask).filter(ReviewTask.id == task_id).first():
        raise_error("TASK_NOT_FOUND")
    q = db.query(AuditLog).filter(AuditLog.task_id == task_id)
    total = q.count()
    logs = q.offset((page - 1) * page_size).limit(page_size).all()
    return {"code": 0, "message": "success", "data": {
        "items": [{"id": l.id, "event_type": l.event_type, "review_task_id": l.task_id,
                   "operator_id": l.operator_id, "detail": l.detail_json,
                   "occurred_at": l.occurred_at} for l in logs],
        "total": total, "page": page, "page_size": page_size,
    }}
