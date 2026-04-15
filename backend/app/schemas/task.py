from pydantic import BaseModel
from typing import Optional


class TaskInfo(BaseModel):
    id: str
    status: str
    assigned_reviewer_id: Optional[str] = None
    sla_deadline: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: str


class DocumentInfo(BaseModel):
    id: Optional[str] = None
    original_filename: str
    file_size_bytes: int
    ocr_quality_level: Optional[str] = None
    ocr_quality_score: Optional[float] = None
    document_type: Optional[str] = None
    block_reason: Optional[str] = None
