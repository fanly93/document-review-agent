import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

# MVP：内存存储上传会话（生产应用 Redis）
_upload_sessions: dict = {}

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
}
FORBIDDEN_KEYWORDS = ["股权融资", "股权转让", "融资协议", "投资协议", "Term Sheet", "股权激励"]


def init_upload(filename: str, file_size_bytes: int, total_parts: int, content_type: str) -> dict:
    from app.core.errors import raise_error

    if file_size_bytes > 52428800:
        raise_error("FILE_TOO_LARGE")
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise_error("UNSUPPORTED_FORMAT")
    if any(kw in filename for kw in FORBIDDEN_KEYWORDS):
        raise_error("DOCUMENT_TYPE_FORBIDDEN")

    chunk_upload_id = str(uuid.uuid4())
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    part_expires = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()

    _upload_sessions[chunk_upload_id] = {
        "filename": filename,
        "file_size_bytes": file_size_bytes,
        "total_parts": total_parts,
        "content_type": content_type,
        "expires_at": expires_at,
    }

    upload_parts = [
        {
            "part_number": i,
            "presigned_url": f"http://localhost:8000/api/v1/upload/chunk/{chunk_upload_id}/{i}",
            "expires_at": part_expires,
        }
        for i in range(1, total_parts + 1)
    ]
    return {"chunk_upload_id": chunk_upload_id, "upload_parts": upload_parts, "session_expires_at": expires_at}


def complete_upload(chunk_upload_id: str, parts: list) -> dict:
    from app.core.errors import raise_error

    session = _upload_sessions.pop(chunk_upload_id, None)
    if not session:
        raise_error("UPLOAD_SESSION_EXPIRED")

    upload_dir = os.getenv("UPLOAD_DIR", "./uploads")
    Path(upload_dir).mkdir(parents=True, exist_ok=True)

    document_id = str(uuid.uuid4())
    storage_path = str(Path(upload_dir) / f"{document_id}_{session['filename']}")
    with open(storage_path, "w", encoding="utf-8") as f:
        f.write(f"[MVP MOCK FILE] {session['filename']}")

    return {
        "document_id": document_id,
        "storage_path": storage_path,
        "filename": session["filename"],
        "file_size_bytes": session["file_size_bytes"],
        "content_type": session["content_type"],
    }
