import enum
from sqlalchemy import Column, String, Enum, Float, DateTime
from app.models.base import BaseModel


class TaskStatus(str, enum.Enum):
    uploaded = "uploaded"
    parsing = "parsing"
    parsed = "parsed"
    parse_failed = "parse_failed"
    auto_reviewing = "auto_reviewing"
    auto_review_failed = "auto_review_failed"
    auto_reviewed = "auto_reviewed"
    human_reviewing = "human_reviewing"
    human_review_failed = "human_review_failed"
    completed = "completed"
    rejected = "rejected"


TERMINAL_STATES = {TaskStatus.parse_failed, TaskStatus.completed, TaskStatus.rejected}

VALID_TRANSITIONS: dict[TaskStatus, list[TaskStatus]] = {
    TaskStatus.uploaded: [TaskStatus.parsing],
    TaskStatus.parsing: [TaskStatus.parsed, TaskStatus.parse_failed, TaskStatus.rejected],
    TaskStatus.parsed: [TaskStatus.auto_reviewing, TaskStatus.rejected],
    TaskStatus.auto_reviewing: [TaskStatus.auto_reviewed, TaskStatus.auto_review_failed, TaskStatus.rejected],
    TaskStatus.auto_review_failed: [TaskStatus.auto_reviewing, TaskStatus.human_reviewing, TaskStatus.rejected],
    TaskStatus.auto_reviewed: [TaskStatus.completed, TaskStatus.human_reviewing],
    TaskStatus.human_reviewing: [TaskStatus.completed, TaskStatus.human_review_failed, TaskStatus.rejected],
    TaskStatus.human_review_failed: [TaskStatus.human_reviewing, TaskStatus.rejected],
}


class ReviewTask(BaseModel):
    __tablename__ = "review_tasks"
    document_id = Column(String(36), nullable=False, unique=True, index=True)
    status = Column(Enum(TaskStatus), nullable=False, default=TaskStatus.uploaded)
    assigned_user_id = Column(String(36), nullable=True)
    vector_db_version = Column(String(50), nullable=False, default="v1.0.0")
    sla_deadline = Column(DateTime(timezone=True), nullable=True)
    overall_risk_score = Column(Float, nullable=True)
    risk_level_summary = Column(String(20), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    uploader_user_id = Column(String(36), nullable=False)
