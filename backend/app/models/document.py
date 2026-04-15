from sqlalchemy import Column, String, Integer, Float
from app.models.base import BaseModel


class Document(BaseModel):
    __tablename__ = "documents"
    original_filename = Column(String(512), nullable=False)
    file_format = Column(String(50), nullable=False)
    storage_path = Column(String(1024), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    ocr_quality_score = Column(Float, nullable=True)
    ocr_quality_level = Column(String(20), nullable=True)
    parse_engine_used = Column(String(50), nullable=True)
    document_type = Column(String(100), nullable=True)
    block_reason = Column(String(500), nullable=True)
    uploader_user_id = Column(String(36), nullable=False)
