"""WebSocket 事件定义与构建工具"""


class EventType:
    UPLOAD_PROGRESS = "upload_progress"
    PARSE_PROGRESS = "parse_progress"
    QUALITY_CHECK = "quality_check"
    PARSE_COMPLETE = "parse_complete"
    PARSE_FAILED = "parse_failed"
    AUTO_REVIEW_PROGRESS = "auto_review_progress"
    HITL_REQUIRED = "hitl_required"
    REVIEW_COMPLETED = "review_completed"
    ERROR = "error"


def make_event(event_name: str, task_id: str, stage: str = None,
               progress: int = 0, message: str = "", **extra) -> dict:
    return {"event": event_name, "task_id": task_id, "stage": stage,
            "progress": progress, "message": message, **extra}


def parse_progress_event(task_id: str, progress: int) -> dict:
    return make_event(EventType.PARSE_PROGRESS, task_id, "parsing", progress, f"文档解析中… {progress}%")

def parse_complete_event(task_id: str) -> dict:
    return make_event(EventType.PARSE_COMPLETE, task_id, "parsing", 100, "文档解析完成")

def parse_failed_event(task_id: str, reason: str = "") -> dict:
    return make_event(EventType.PARSE_FAILED, task_id, "parsing", 0, f"解析失败：{reason}")

def auto_review_progress_event(task_id: str, layer: int, total: int = 3) -> dict:
    return make_event(EventType.AUTO_REVIEW_PROGRESS, task_id, "auto_reviewing",
                      int(layer / total * 100), f"自动审核第 {layer}/{total} 层")

def hitl_required_event(task_id: str, reviewer_id: str, risk_count: int) -> dict:
    return make_event(EventType.HITL_REQUIRED, task_id, "human_reviewing", 0,
                      f"需要人工审核（{risk_count} 个风险项）",
                      reviewer_id=reviewer_id, risk_count=risk_count)

def review_completed_event(task_id: str, overall_risk_score: float) -> dict:
    return make_event(EventType.REVIEW_COMPLETED, task_id, "completed", 100,
                      "审核流程已完成", overall_risk_score=overall_risk_score)
