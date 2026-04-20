"""批注服务"""
from sqlalchemy.orm import Session
from app.models.annotation import Annotation
from app.models.review_task import ReviewTask
from app.models.risk_item import RiskItem
from app.core.errors import raise_error


def create_annotation(db: Session, task_id: str, risk_item_id: str | None, author_id: str, content: str) -> Annotation:
    if not db.query(ReviewTask).filter(ReviewTask.id == task_id).first():
        raise_error("TASK_NOT_FOUND")
    if risk_item_id:
        if not db.query(RiskItem).filter(RiskItem.id == risk_item_id, RiskItem.task_id == task_id).first():
            raise_error("RISK_ITEM_NOT_FOUND")
    ann = Annotation(
        task_id=task_id,
        risk_item_id=risk_item_id,
        author_id=author_id,
        content=content,
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return ann


def list_annotations(db: Session, task_id: str, risk_item_id: str | None = None) -> list:
    if not db.query(ReviewTask).filter(ReviewTask.id == task_id).first():
        raise_error("TASK_NOT_FOUND")
    q = db.query(Annotation).filter(Annotation.task_id == task_id)
    if risk_item_id:
        q = q.filter(Annotation.risk_item_id == risk_item_id)
    return q.order_by(Annotation.created_at.asc()).all()
