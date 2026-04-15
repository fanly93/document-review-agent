"""WebSocket 连接管理器（按 task_id 分组，单例）"""
import asyncio
import json
from fastapi import WebSocket
from typing import Dict, List


class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, task_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.active_connections.setdefault(task_id, []).append(websocket)

    async def disconnect(self, task_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            conns = self.active_connections.get(task_id, [])
            if websocket in conns:
                conns.remove(websocket)
            if not conns:
                self.active_connections.pop(task_id, None)

    async def send_event(self, task_id: str, event: dict) -> None:
        conns = list(self.active_connections.get(task_id, []))
        dead = []
        for ws in conns:
            try:
                await ws.send_text(json.dumps(event, ensure_ascii=False))
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(task_id, ws)

    def get_connection_count(self, task_id: str) -> int:
        return len(self.active_connections.get(task_id, []))


ws_manager = WebSocketManager()
