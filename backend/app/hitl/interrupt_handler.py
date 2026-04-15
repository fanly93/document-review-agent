"""
LangGraph interrupt/resume 处理器
thread_id 规范：f"review-task-{review_task_id}"
"""
from langgraph.types import Command


def get_thread_id(review_task_id: str) -> str:
    return f"review-task-{review_task_id}"


def resume_graph(graph, review_task_id: str, decisions: list, operator_id: str) -> dict:
    """
    恢复 LangGraph 执行（在 human_decision_node interrupt 后调用）

    Args:
        graph: 编译后的图实例（来自 get_review_graph()）
        review_task_id: ReviewTask UUID
        decisions: 审核决策列表
        operator_id: 审核人 ID
    """
    thread_id = get_thread_id(review_task_id)
    resume_data = {"decisions": decisions, "operator_id": operator_id}
    config = {"configurable": {"thread_id": thread_id}}
    return graph.invoke(Command(resume=resume_data), config=config)


def get_graph_state(graph, review_task_id: str):
    """获取当前图状态（用于查询 interrupt payload）"""
    config = {"configurable": {"thread_id": get_thread_id(review_task_id)}}
    return graph.get_state(config)
