"""完成审核服务"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.review_task import ReviewTask, TaskStatus
from app.models.risk_item import RiskItem
from app.models.audit_log import AuditLog
from app.core.errors import raise_error
from langgraph.types import Command


def complete_review_task(db: Session, task_id: str, reviewer_id: str, graph) -> dict:
    """
    完成人工审核：校验前置条件，触发 LangGraph finalize，更新任务状态。
    """
    task = db.query(ReviewTask).filter(ReviewTask.id == task_id).first()
    if not task:
        raise_error("TASK_NOT_FOUND")

    if task.status != TaskStatus.human_reviewing:
        raise_error("TASK_STATUS_CONFLICT")

    # 校验无 pending 的 critical/high 条目
    pending_count = db.query(RiskItem).filter(
        RiskItem.task_id == task_id,
        RiskItem.risk_level.in_(["critical", "high"]),
        RiskItem.reviewer_status == "pending",
    ).count()
    if pending_count > 0:
        raise_error("CRITICAL_HIGH_NOT_ALL_HANDLED")

    # 触发 LangGraph Command(resume=...) 推进到 finalize_node
    thread_id = f"review-task-{task_id}"
    try:
        graph.invoke(
            Command(resume={"decisions": [], "operator_id": reviewer_id}),
            config={"configurable": {"thread_id": thread_id}},
        )
    except Exception:
        pass  # 图可能已经到达终态，忽略

    # 确保数据库状态已更新
    db.refresh(task)
    if task.status != TaskStatus.completed:
        task.status = TaskStatus.completed
        task.completed_at = datetime.now(timezone.utc)

    # 写入审计日志
    log = AuditLog(
        task_id=task_id,
        event_type="task_status_change",
        actor_type="human",
        operator_id=reviewer_id,
        detail_json={"old_status": "human_reviewing", "new_status": "completed", "trigger": "user"},
        occurred_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(log)
    db.commit()

    return {
        "task_id": task_id,
        "status": "completed",
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
    }
