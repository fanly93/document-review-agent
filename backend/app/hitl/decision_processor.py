"""
审核决策处理器 — 四类操作：approve / edit / reject / annotate

校验规则（依据 fastapi-spec-v1.0.md）：
- reject：comment 必填且 ≥ 10 字符
- edit：edited_content 必填
- annotate：comment 必填
"""
from datetime import datetime, timezone


class DecisionValidationError(Exception):
    def __init__(self, error_code: str, message: str):
        self.error_code = error_code
        self.message = message
        super().__init__(message)


def validate_decision(decision: dict) -> None:
    action = decision.get("action")
    comment = decision.get("comment") or ""

    if action == "reject":
        if len(comment) < 10:
            raise DecisionValidationError(
                "REJECT_REASON_TOO_SHORT",
                f"驳回理由不足最低字符数（当前 {len(comment)} 字符，需 ≥ 10 字符）",
            )
    elif action == "edit":
        if not decision.get("edited_content"):
            raise DecisionValidationError("EDIT_CONTENT_REQUIRED", "编辑操作必须提供 edited_content")
    elif action == "annotate":
        if not comment:
            raise DecisionValidationError("ANNOTATE_COMMENT_REQUIRED", "批注操作必须提供 comment")


def apply_decision_to_risk_item(risk_item: dict, decision: dict) -> tuple[dict, dict]:
    """应用单条决策，返回 (updated_item, review_record)"""
    action = decision.get("action")
    operated_at = decision.get("operated_at") or datetime.now(timezone.utc).isoformat()

    updated = dict(risk_item)
    old_val, new_val = {}, {}

    if action == "approve":
        updated["reviewer_status"] = "approved"

    elif action == "edit":
        updated["reviewer_status"] = "edited"
        ec = decision.get("edited_content", {})
        for field in ("risk_level", "risk_description", "reasoning"):
            if field in ec:
                old_val[field] = risk_item.get(field)
                new_val[field] = ec[field]
                updated[field] = ec[field]

    elif action == "reject":
        updated["reviewer_status"] = "reviewer_rejected"
        old_val["status"] = "pending"
        new_val["status"] = "reviewer_rejected"
        new_val["reject_reason"] = decision.get("comment")

    elif action == "annotate":
        updated.setdefault("annotations", []).append(
            {"content": decision.get("comment"), "created_at": operated_at}
        )

    record = {
        "risk_item_id": risk_item["id"],
        "action": action,
        "old_value": old_val,
        "new_value": new_val,
        "comment": decision.get("comment"),
        "operated_at": operated_at,
        "operator_id": decision.get("operator_id", ""),
    }
    return updated, record


def process_decisions(decisions: list, risk_items: list, operator_id: str) -> dict:
    """
    批量处理审核决策。
    Returns: {updated_risk_items, human_review_records, errors}
    """
    item_map = {item["id"]: item for item in risk_items}
    updated_list, records, errors = [], [], []

    for dec in decisions:
        rid = dec.get("risk_item_id")
        if rid not in item_map:
            errors.append({"risk_item_id": rid, "error": "RISK_ITEM_NOT_FOUND"})
            continue
        try:
            validate_decision(dec)
        except DecisionValidationError as e:
            errors.append({"risk_item_id": rid, "error": e.error_code, "message": e.message})
            continue

        dec_with_op = {**dec, "operator_id": operator_id}
        updated, rec = apply_decision_to_risk_item(item_map[rid], dec_with_op)
        item_map[rid] = updated
        updated_list.append(updated)
        records.append(rec)

    return {
        "updated_risk_items": list(item_map.values()),
        "human_review_records": records,
        "errors": errors,
    }
