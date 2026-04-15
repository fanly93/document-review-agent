import os
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="法律文档智能审核系统 API",
    description="Legal Document AI Review System",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册 API 路由
from app.api.v1.router import api_router
app.include_router(api_router, prefix="/api/v1")


@app.on_event("startup")
async def startup_event():
    upload_dir = os.getenv("UPLOAD_DIR", "./uploads")
    Path(upload_dir).mkdir(parents=True, exist_ok=True)
    from app.db.session import create_tables
    create_tables()


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "legal-review-backend"}


@app.websocket("/ws/v1/tasks/{task_id}/progress")
async def websocket_progress(websocket: WebSocket, task_id: str):
    from app.websocket.manager import ws_manager
    await ws_manager.connect(task_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(task_id, websocket)
