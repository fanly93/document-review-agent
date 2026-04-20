import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.review_task import ReviewTask, TaskStatus, VALID_TRANSITIONS, TERMINAL_STATES
from app.models.document import Document
from app.models.risk_item import RiskItem
from app.models.audit_log import AuditLog
from app.core.errors import raise_error
from app.core.state_machine import validate_transition


def create_task_and_document(db: Session, document_data: dict, uploader_user_id: str) -> dict:
    doc = Document(
        id=document_data["document_id"],
        original_filename=document_data["filename"],
        file_format=document_data["content_type"].split("/")[-1],
        storage_path=document_data["storage_path"],
        file_size_bytes=document_data["file_size_bytes"],
        uploader_user_id=uploader_user_id,
    )
    db.add(doc)

    task_id = str(uuid.uuid4())
    task = ReviewTask(
        id=task_id,
        document_id=document_data["document_id"],
        status=TaskStatus.uploaded,
        vector_db_version="v1.0.0",
        uploader_user_id=uploader_user_id,
    )
    db.add(task)

    log = AuditLog(
        task_id=task_id, event_type="task_created", actor_type="system",
        detail_json={"status": "uploaded"},
        occurred_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(log)
    db.commit()
    return {"task_id": task_id, "document_id": document_data["document_id"]}


def sync_workflow_to_db(db: Session, task_id: str, workflow_result: dict) -> None:
    """
    工作流完成后将图状态同步写入数据库。
    直接覆盖状态（绕过逐步状态机），适合 MVP 同步触发场景。
    同时批量写入 risk_items。
    """
    task = db.query(ReviewTask).filter(ReviewTask.id == task_id).first()
    if not task:
        return

    final_status = workflow_result.get("current_status")
    if final_status and final_status in [s.value for s in TaskStatus]:
        task.status = TaskStatus(final_status)

    risk_items_data = workflow_result.get("risk_items", [])
    score_map = {"critical": 100, "high": 75, "medium": 50, "low": 25}
    if risk_items_data:
        scores = [score_map.get(i.get("risk_level", "low"), 25) for i in risk_items_data]
        task.overall_risk_score = sum(scores) / len(scores)
        levels = [i.get("risk_level") for i in risk_items_data]
        if "critical" in levels:
            task.risk_level_summary = "critical"
        elif "high" in levels:
            task.risk_level_summary = "high"
        elif "medium" in levels:
            task.risk_level_summary = "medium"
        else:
            task.risk_level_summary = "low"
    else:
        # 0 风险项时分数为 0，等级为 low
        task.overall_risk_score = 0.0
        task.risk_level_summary = "low"

        # 清除旧风险项（避免重复写入），再批量插入
        db.query(RiskItem).filter(RiskItem.task_id == task_id).delete()
        for item in risk_items_data:
            ri = RiskItem(
                id=item.get("id") or str(uuid.uuid4()),
                task_id=task_id,
                risk_type=item.get("risk_type", "unknown"),
                risk_level=item.get("risk_level", "medium"),
                risk_description=item.get("risk_description", ""),
                confidence_score=item.get("confidence", item.get("confidence_score", 0.5)),
                confidence_category=item.get("confidence_category", "clause"),
                reasoning=item.get("reasoning"),
                location_page=item.get("location_page"),
                location_paragraph=item.get("location_paragraph"),
                reviewer_status=item.get("reviewer_status", "pending"),
                source_references_json=item.get("source_references", []),
            )
            db.add(ri)

    if final_status == "completed":
        task.completed_at = datetime.now(timezone.utc)

    log = AuditLog(
        task_id=task_id, event_type="workflow_synced", actor_type="system",
        detail_json={"final_status": final_status, "risk_items_count": len(risk_items_data)},
        occurred_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(log)
    db.commit()


def transition_task_status(db: Session, task_id: str, new_status: str, actor_type: str = "system") -> ReviewTask:
    task = db.query(ReviewTask).filter(ReviewTask.id == task_id).first()
    if not task:
        raise_error("TASK_NOT_FOUND")
    if not validate_transition(task.status.value, new_status):
        raise_error("TASK_STATUS_CONFLICT", f"不允许从 {task.status.value} 转移到 {new_status}")

    old_status = task.status.value
    task.status = TaskStatus(new_status)
    if new_status == "human_reviewing":
        task.sla_deadline = datetime.now(timezone.utc) + timedelta(hours=1)

    log = AuditLog(
        task_id=task_id, event_type="task_status_change", actor_type=actor_type,
        detail_json={"old_status": old_status, "new_status": new_status},
        occurred_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(log)
    db.commit()
    db.refresh(task)
    return task
