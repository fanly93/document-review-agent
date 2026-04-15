from pydantic import BaseModel
from typing import Optional, List


class SourceReference(BaseModel):
    source_type: str
    source_name: str
    article_number: Optional[str] = None
    reference_text: Optional[str] = None


class RiskItemResponse(BaseModel):
    id: str
    task_id: str
    risk_type: str
    risk_level: str
    risk_description: str
    confidence_score: float
    confidence_category: str
    reasoning: Optional[str] = None
    location_page: Optional[int] = None
    location_paragraph: Optional[int] = None
    reviewer_status: str
    source_references: List[SourceReference] = []
