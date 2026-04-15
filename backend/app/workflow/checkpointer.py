import os
from langgraph.checkpoint.memory import MemorySaver


def get_checkpointer():
    env = os.getenv("APP_ENV", "development")
    if env == "production":
        raise NotImplementedError("生产环境请配置 PostgresCheckpointer")
    return MemorySaver()
