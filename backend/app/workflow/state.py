from typing import TypedDict, Annotated
import operator


def merge_human_reviews(left: list, right: list) -> list:
    """按 operated_at 时间戳合并并去重"""
    combined = left + right
    seen = set()
    unique = []
    for item in combined:
        key = item.get("id") or str(item)
        if key not in seen:
            seen.add(key)
            unique.append(item)
    unique.sort(key=lambda x: x.get("operated_at", ""))
    return unique


class ReviewState(TypedDict):
    document_id: str
    review_task_id: str
    current_status: str                                      # 覆盖型
    document_content: str
    document_metadata: dict                                  # filename/file_type/page_count/ocr_quality_score
    risk_items: Annotated[list, operator.add]               # 累积型
    human_reviews: Annotated[list, merge_human_reviews]     # 自定义 Reducer
    assigned_reviewer_id: str | None                         # 覆盖型
    vector_db_version: str
    decision_log: Annotated[list, operator.add]             # 累积型
    completed_at: str | None                                 # 覆盖型
