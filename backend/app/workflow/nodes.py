import uuid
from datetime import datetime, timezone
from langgraph.types import interrupt
from app.workflow.state import ReviewState

FORBIDDEN_KEYWORDS = ["股权融资", "股权转让", "融资协议", "投资协议", "Term Sheet", "股权激励"]
DOCUMENT_TYPE_MAP = {
    "采购": "procurement_contract",
    "服务": "service_contract",
    "劳动": "employment_contract",
    "租赁": "lease_contract",
}


def _detect_doc_type(text: str) -> str:
    for kw, dtype in DOCUMENT_TYPE_MAP.items():
        if kw in text:
            return dtype
    return "general_contract"  # MVP 默认，避免触发 unknown HITL


# ── parse_node ──────────────────────────────────────────────
def parse_node(state: ReviewState) -> dict:
    filename = state.get("document_metadata", {}).get("filename", "unknown.pdf")
    simulated_content = f"[模拟解析] 文档《{filename}》的合同文本内容。包含甲乙双方权责条款。"
    ocr_score = 92.0  # MVP 固定高质量

    if ocr_score < 70:
        return {"current_status": "parse_failed"}

    doc_type = _detect_doc_type(filename + simulated_content)
    return {
        "current_status": "parsed",
        "document_content": simulated_content,
        "document_metadata": {
            **state.get("document_metadata", {}),
            "file_type": doc_type,
            "ocr_quality_score": ocr_score,
            "page_count": 5,
        },
        "decision_log": [{"event": "parse_completed", "ocr_quality_score": ocr_score,
                          "ts": datetime.now(timezone.utc).isoformat()}],
    }


# ── auto_review_node ─────────────────────────────────────────
def auto_review_node(state: ReviewState) -> dict:
    content = state.get("document_content", "")
    doc_type = state.get("document_metadata", {}).get("file_type", "unknown")

    # 融资股权硬拦截
    if any(kw in content for kw in FORBIDDEN_KEYWORDS):
        return {
            "current_status": "rejected",
            "risk_items": [{
                "id": str(uuid.uuid4()), "risk_type": "forbidden_document_type",
                "risk_level": "critical", "confidence": 0.99,
                "confidence_category": "fact",
                "risk_description": "文档包含禁止类型关键词（融资/股权）",
                "location_page": 1, "location_paragraph": 0,
                "reviewer_status": "pending", "source_references": [],
            }],
        }

    risk_items = []

    # Layer 2: 条款识别
    if "违约" in content or "赔偿" in content:
        risk_items.append({
            "id": str(uuid.uuid4()), "risk_type": "liability_asymmetry",
            "risk_level": "high", "confidence": 0.75,
            "confidence_category": "clause",
            "risk_description": "存在违约/赔偿条款，需审查对等性",
            "location_page": 2, "location_paragraph": 5,
            "reviewer_status": "pending", "source_references": [],
        })

    # Layer 3: MVP 模拟 LLM 分析（中等风险，不触发 HITL）
    risk_items.append({
        "id": str(uuid.uuid4()), "risk_type": "general_review",
        "risk_level": "medium", "confidence": 0.82,
        "confidence_category": "clause",
        "risk_description": "[MVP] LLM 分析：文档整体风险中等，建议仔细审查核心条款",
        "location_page": 1, "location_paragraph": 1,
        "reviewer_status": "pending", "source_references": [],
    })

    return {
        "current_status": "auto_reviewed",
        "risk_items": risk_items,
        "decision_log": [{"event": "auto_review_completed", "risk_count": len(risk_items),
                          "ts": datetime.now(timezone.utc).isoformat()}],
    }


# ── hitl_trigger_check ───────────────────────────────────────
def hitl_trigger_check(state: ReviewState) -> str:
    """条件路由函数（非节点），返回 'need_hitl' | 'no_hitl'"""
    risk_items = state.get("risk_items", [])
    doc_type = state.get("document_metadata", {}).get("file_type", "unknown")

    if doc_type == "unknown":
        return "need_hitl"
    for item in risk_items:
        if item.get("risk_level") in ("high", "critical"):
            return "need_hitl"
        if item.get("confidence", 1.0) < 0.5:
            return "need_hitl"
    return "no_hitl"


# ── assign_reviewer_node ─────────────────────────────────────
def assign_reviewer_node(state: ReviewState) -> dict:
    return {
        "current_status": "human_reviewing",
        "assigned_reviewer_id": "reviewer-001",
        "decision_log": [{"event": "reviewer_assigned", "reviewer_id": "reviewer-001",
                          "ts": datetime.now(timezone.utc).isoformat()}],
    }


# ── human_decision_node ──────────────────────────────────────
def human_decision_node(state: ReviewState) -> dict:
    """核心中断点：interrupt() 暂停，等待 Command(resume=...) 恢复"""
    pending = [i for i in state.get("risk_items", []) if i.get("reviewer_status") == "pending"]
    payload = {
        "action": "human_review_required",
        "task_id": state["review_task_id"],
        "operator_id": state.get("assigned_reviewer_id"),
        "risk_items": pending,
    }
    human_input = interrupt(payload)
    return {
        "human_reviews": [human_input] if human_input else [],
        "decision_log": [{"event": "human_review_submitted",
                          "ts": datetime.now(timezone.utc).isoformat()}],
    }


# ── apply_decisions_node ─────────────────────────────────────
def apply_decisions_node(state: ReviewState) -> dict:
    human_reviews = state.get("human_reviews", [])
    risk_items = list(state.get("risk_items", []))
    item_map = {item["id"]: item for item in risk_items}

    if human_reviews:
        latest = human_reviews[-1]
        decisions = latest.get("decisions", []) if isinstance(latest, dict) else []
        for dec in decisions:
            rid = dec.get("risk_item_id")
            action = dec.get("action")
            if rid in item_map:
                if action == "approve":
                    item_map[rid]["reviewer_status"] = "approved"
                elif action == "edit":
                    item_map[rid]["reviewer_status"] = "edited"
                    ec = dec.get("edited_content", {})
                    if isinstance(ec, dict):
                        item_map[rid].update(ec)
                elif action == "reject":
                    item_map[rid]["reviewer_status"] = "reviewer_rejected"
                elif action == "annotate":
                    item_map[rid].setdefault("annotations", []).append(dec.get("comment", ""))

    return {
        "risk_items": list(item_map.values()),
        "decision_log": [{"event": "decisions_applied",
                          "ts": datetime.now(timezone.utc).isoformat()}],
    }


def check_hitl_complete(state: ReviewState) -> str:
    """条件路由：检查是否仍有未处理 Critical/High 条目"""
    for item in state.get("risk_items", []):
        if item.get("risk_level") in ("high", "critical") and item.get("reviewer_status") == "pending":
            return "continue_hitl"
    return "finalize"


# ── finalize_node ─────────────────────────────────────────────
def finalize_node(state: ReviewState) -> dict:
    risk_items = state.get("risk_items", [])
    score_map = {"critical": 100, "high": 75, "medium": 50, "low": 25, "info": 10}
    scores = [score_map.get(i.get("risk_level", "low"), 25) for i in risk_items]
    overall = sum(scores) / len(scores) if scores else 0.0

    return {
        "current_status": "completed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "decision_log": [{"event": "review_finalized", "overall_risk_score": overall,
                          "ts": datetime.now(timezone.utc).isoformat()}],
    }
