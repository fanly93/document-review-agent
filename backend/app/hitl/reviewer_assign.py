"""审核人分配策略"""


def assign_reviewer(task_id: str, db_session=None) -> str:
    """
    分配审核人。
    MVP：返回固定测试 reviewer ID。
    生产：从 DB 查询负载最低的 reviewer 用户。
    """
    # 生产实现示例（注释）：
    # reviewers = db_session.query(User).filter(User.role == "reviewer").all()
    # return min(reviewers, key=lambda u: u.active_task_count).id
    return "reviewer-001"
