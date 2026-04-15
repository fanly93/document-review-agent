from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.review_task import ReviewTask, TaskStatus
from app.models.risk_item import RiskItem
from app.models.human_review import HumanReview
from app.models.audit_log import AuditLog
from app.core.errors import raise_error
from app.hitl.decision_processor import process_decisions


def submit_review_decisions(
    db: Session, task_id: str, decisions: list, reviewer_id: str, graph
) -> dict:
    task = db.query(ReviewTask).filter(ReviewTask.id == task_id).first()
    if not task:
        raise_error("TASK_NOT_FOUND")
    if task.status != TaskStatus.human_reviewing:
        raise_error("TASK_STATUS_CONFLICT", "任务当前状态不是 human_reviewing")
    if task.assigned_user_id != reviewer_id:
        raise_error("NOT_ASSIGNED_REVIEWER")

    risk_items_db = db.query(RiskItem).filter(RiskItem.task_id == task_id).all()
    risk_items = [
        {"id": i.id, "risk_level": i.risk_level, "reviewer_status": i.reviewer_status,
         "risk_description": i.risk_description}
        for i in risk_items_db
    ]

    result = process_decisions(decisions, risk_items, reviewer_id)
    if result["errors"]:
        raise_error("RISK_ITEM_NOT_FOUND", str(result["errors"]))

    for rec in result["human_review_records"]:
        db.add(HumanReview(
            task_id=task_id, reviewer_id=reviewer_id,
            risk_item_id=rec["risk_item_id"], action=rec["action"],
            old_value_json=rec.get("old_value"), new_value_json=rec.get("new_value"),
            comment=rec.get("comment"), operated_at=rec["operated_at"],
        ))

    db.add(AuditLog(
        task_id=task_id, event_type="human_action", actor_type="human",
        operator_id=reviewer_id,
        detail_json={"decisions_count": len(decisions)},
        occurred_at=datetime.now(timezone.utc).isoformat(),
    ))
    db.commit()

    # 调用 LangGraph resume
    if graph:
        from app.hitl.interrupt_handler import resume_graph
        resume_graph(graph, task_id, decisions, reviewer_id)

    return {"message": "审核决策已提交", "task_id": task_id}
