import enum
from sqlalchemy import Column, String, Enum
from app.models.base import BaseModel


class UserRole(str, enum.Enum):
    legal_staff = "legal_staff"
    reviewer = "reviewer"
    manager = "manager"


class User(BaseModel):
    __tablename__ = "users"
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.legal_staff)
