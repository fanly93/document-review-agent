from sqlalchemy import Column, String, Text, JSON
from app.models.base import BaseModel


class HumanReview(BaseModel):
    __tablename__ = "human_reviews"
    task_id = Column(String(36), nullable=False, index=True)
    reviewer_id = Column(String(36), nullable=False)
    risk_item_id = Column(String(36), nullable=False)
    action = Column(String(20), nullable=False)
    old_value_json = Column(JSON, nullable=True)
    new_value_json = Column(JSON, nullable=True)
    comment = Column(Text, nullable=True)
    operated_at = Column(String(50), nullable=False)
