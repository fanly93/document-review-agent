import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.review import AuthRegisterRequest, AuthLoginRequest
from app.core.security import get_password_hash, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
def register(req: AuthRegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(400, detail={"code": "EMAIL_EXISTS", "message": "邮箱已注册"})
    user = User(id=str(uuid.uuid4()), email=req.email,
                hashed_password=get_password_hash(req.password),
                full_name=req.full_name, role=UserRole(req.role))
    db.add(user)
    db.commit()
    return {"code": 0, "message": "success",
            "data": {"user_id": user.id, "email": user.email, "role": user.role.value}}


@router.post("/login")
def login(req: AuthLoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(401, detail={"code": "INVALID_CREDENTIALS", "message": "邮箱或密码错误"})
    token = create_access_token({"sub": user.id, "role": user.role.value})
    return {"code": 0, "message": "success",
            "data": {"access_token": token, "token_type": "bearer",
                     "user_id": user.id, "role": user.role.value}}


@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    """MVP 调试：列出所有用户"""
    users = db.query(User).all()
    return {"code": 0, "data": [{"id": u.id, "email": u.email, "role": u.role.value} for u in users]}
