from sqlalchemy import Column, String, Integer, Float, Text, JSON
from app.models.base import BaseModel


class RiskItem(BaseModel):
    __tablename__ = "risk_items"
    task_id = Column(String(36), nullable=False, index=True)
    risk_type = Column(String(100), nullable=False)
    risk_level = Column(String(20), nullable=False)
    risk_description = Column(Text, nullable=False)
    confidence_score = Column(Float, nullable=False)
    confidence_category = Column(String(20), nullable=False)
    reasoning = Column(Text, nullable=True)
    location_page = Column(Integer, nullable=True)
    location_paragraph = Column(Integer, nullable=True)
    reviewer_status = Column(String(30), default="pending")
    source_references_json = Column(JSON, default=list)
