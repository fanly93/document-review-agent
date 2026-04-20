from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.document import Document
from app.models.review_task import ReviewTask, TaskStatus
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("")
def list_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Document, ReviewTask).join(
        ReviewTask, ReviewTask.document_id == Document.id
    )
    if status:
        status_values = [s.strip() for s in status.split(",")]
        valid_statuses = []
        for s in status_values:
            try:
                valid_statuses.append(TaskStatus(s))
            except ValueError:
                pass
        if valid_statuses:
            q = q.filter(ReviewTask.status.in_(valid_statuses))
    total = q.count()
    rows = q.order_by(Document.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    items = []
    for doc, task in rows:
        items.append({
            "document_id": doc.id,
            "task_id": task.id,
            "original_filename": doc.original_filename,
            "file_size_bytes": doc.file_size_bytes,
            "ocr_quality_level": doc.ocr_quality_level,
            "ocr_quality_score": doc.ocr_quality_score,
            "document_type": doc.document_type,
            "block_reason": doc.block_reason,
            "task_status": task.status.value,
            "created_at": doc.created_at.isoformat() if doc.created_at else None,
        })
    return {"code": 0, "message": "success", "data": {
        "items": items, "total": total, "page": page, "page_size": page_size,
    }}
