import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.review_task import ReviewTask, TaskStatus, VALID_TRANSITIONS, TERMINAL_STATES
from app.models.document import Document
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
