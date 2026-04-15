from pydantic import BaseModel, Field
from typing import List, Optional


class DecisionItem(BaseModel):
    risk_item_id: str
    action: str
    comment: Optional[str] = None
    edited_content: Optional[dict] = None
    operated_at: Optional[str] = None


class SubmitReviewRequest(BaseModel):
    decisions: List[DecisionItem]


class RejectTaskRequest(BaseModel):
    reason: str = Field(..., min_length=10)


class AuthRegisterRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None
    role: str = "legal_staff"


class AuthLoginRequest(BaseModel):
    email: str
    password: str
