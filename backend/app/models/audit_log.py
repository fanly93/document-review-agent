from sqlalchemy import Column, String, JSON
from app.models.base import BaseModel


class AuditLog(BaseModel):
    __tablename__ = "audit_logs"
    task_id = Column(String(36), nullable=False, index=True)
    event_type = Column(String(50), nullable=False)
    actor_type = Column(String(20), nullable=False)
    operator_id = Column(String(36), nullable=True)
    detail_json = Column(JSON, nullable=True)
    occurred_at = Column(String(50), nullable=False)

    # 禁止 ORM 执行 UPDATE/DELETE 的保护（通过事件监听）
    # 生产环境通过数据库权限限制：只给 INSERT 权限
