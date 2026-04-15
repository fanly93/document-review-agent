from app.models.review_task import VALID_TRANSITIONS, TERMINAL_STATES, TaskStatus


def validate_transition(current: str, new: str) -> bool:
    try:
        c, n = TaskStatus(current), TaskStatus(new)
    except ValueError:
        return False
    if c in TERMINAL_STATES:
        return False
    return n in VALID_TRANSITIONS.get(c, [])
