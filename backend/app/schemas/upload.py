from pydantic import BaseModel, Field
from typing import List


class UploadInitRequest(BaseModel):
    original_filename: str = Field(..., max_length=512)
    file_size_bytes: int = Field(..., le=52428800)
    total_parts: int = Field(..., ge=1, le=20)
    content_type: str


class UploadPart(BaseModel):
    part_number: int
    presigned_url: str
    expires_at: str


class UploadCompleteRequest(BaseModel):
    chunk_upload_id: str
    parts: List[dict]
