"""
LLM 模型工厂 — 通过环境变量切换模型提供商

环境变量：
- LLM_PROVIDER: "deepseek"（默认）| "dashscope"
- DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_MODEL
- DASHSCOPE_API_KEY / DASHSCOPE_BASE_URL / DASHSCOPE_MODEL
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.language_models import BaseChatModel

# 确保无论模块加载顺序如何，.env 总能被读到
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent.parent.parent / ".env")


def get_llm(
    model_name: str = None,
    temperature: float = 0.1,
    streaming: bool = False,
    **kwargs
) -> BaseChatModel:
    """
    根据 LLM_PROVIDER 环境变量返回对应的 LangChain Chat 模型。
    DeepSeek 和 DashScope 均使用 OpenAI 兼容接口。
    """
    provider = os.getenv("LLM_PROVIDER", "deepseek").lower()

    if provider == "deepseek":
        return ChatOpenAI(
            model=model_name or os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
            api_key=os.getenv("DEEPSEEK_API_KEY", ""),
            base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
            temperature=temperature,
            streaming=streaming,
            **kwargs,
        )
    elif provider == "dashscope":
        return ChatOpenAI(
            model=model_name or os.getenv("DASHSCOPE_MODEL", "qwen-max"),
            api_key=os.getenv("DASHSCOPE_API_KEY", ""),
            base_url=os.getenv(
                "DASHSCOPE_BASE_URL",
                "https://dashscope.aliyuncs.com/compatible-mode/v1",
            ),
            temperature=temperature,
            streaming=streaming,
            **kwargs,
        )
    else:
        raise ValueError(
            f"不支持的 LLM_PROVIDER: {provider}。支持的值：deepseek, dashscope"
        )


def get_review_llm() -> BaseChatModel:
    """用于文档审核的 LLM（低温度，高确定性）"""
    return get_llm(temperature=0.05)


def get_streaming_llm() -> BaseChatModel:
    """支持流式输出的 LLM"""
    return get_llm(streaming=True)
