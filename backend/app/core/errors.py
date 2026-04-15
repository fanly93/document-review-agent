from fastapi import HTTPException

ERRORS: dict[str, tuple[int, str]] = {
    "UNSUPPORTED_FORMAT":            (400, "文件格式不支持，请上传 PDF 或 Word 文件"),
    "FILE_TOO_LARGE":                (400, "文件大小超限（最大 50MB）"),
    "FILE_CORRUPTED":                (400, "文件可能已损坏"),
    "DOCUMENT_TYPE_FORBIDDEN":       (403, "此类文档不在 AI 审核范围"),
    "UPLOAD_SESSION_EXPIRED":        (400, "上传会话已过期，请重新上传"),
    "PART_MISSING":                  (400, "分片未全部到齐，请重试"),
    "TASK_NOT_FOUND":                (404, "任务不存在"),
    "TASK_STATUS_CONFLICT":          (409, "当前任务状态不允许此操作"),
    "NOT_ASSIGNED_REVIEWER":         (403, "您没有该任务的审核权限"),
    "RISK_ITEM_NOT_FOUND":           (404, "风险项不存在或不属于此任务"),
    "REJECT_REASON_TOO_SHORT":       (422, "驳回理由不足最低字符数（需 ≥ 10 字符）"),
    "CRITICAL_HIGH_NOT_ALL_HANDLED": (422, "仍有 Critical/High 条目未处理"),
}


def raise_error(error_code: str, detail: str = None):
    http_status, message = ERRORS.get(error_code, (400, "未知错误"))
    raise HTTPException(
        status_code=http_status,
        detail={"code": error_code, "message": message, "detail": detail},
    )
