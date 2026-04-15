from fastapi import APIRouter
from app.api.v1 import auth, upload, tasks, review

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(upload.router)
api_router.include_router(tasks.router)
api_router.include_router(review.router)
