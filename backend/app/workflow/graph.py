from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from app.workflow.state import ReviewState
from app.workflow.nodes import (
    parse_node, auto_review_node, hitl_trigger_check,
    assign_reviewer_node, human_decision_node,
    apply_decisions_node, check_hitl_complete, finalize_node,
)

_graph_instance = None


def build_review_graph(checkpointer=None):
    graph = StateGraph(ReviewState)

    graph.add_node("parse", parse_node)
    graph.add_node("auto_review", auto_review_node)
    graph.add_node("assign_reviewer", assign_reviewer_node)
    graph.add_node("human_decision", human_decision_node)
    graph.add_node("apply_decisions", apply_decisions_node)
    graph.add_node("finalize", finalize_node)

    graph.set_entry_point("parse")

    graph.add_conditional_edges(
        "parse",
        lambda s: s.get("current_status", ""),
        {"parsed": "auto_review", "parse_failed": END, "rejected": END},
    )
    graph.add_conditional_edges(
        "auto_review",
        lambda s: "rejected" if s.get("current_status") == "rejected" else hitl_trigger_check(s),
        {"need_hitl": "assign_reviewer", "no_hitl": "finalize", "rejected": END},
    )
    graph.add_edge("assign_reviewer", "human_decision")
    graph.add_edge("human_decision", "apply_decisions")
    graph.add_conditional_edges(
        "apply_decisions",
        check_hitl_complete,
        {"continue_hitl": "human_decision", "finalize": "finalize"},
    )
    graph.add_edge("finalize", END)

    cp = checkpointer if checkpointer is not None else MemorySaver()
    return graph.compile(checkpointer=cp)


def get_review_graph():
    global _graph_instance
    if _graph_instance is None:
        _graph_instance = build_review_graph()
    return _graph_instance
