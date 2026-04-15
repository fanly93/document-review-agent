# LLM 模型接入调研报告

## 结论

DeepSeek 和 DashScope 均提供 OpenAI 兼容接口，统一使用 `langchain_openai.ChatOpenAI`，通过 `base_url` 参数切换。

## DeepSeek 接入

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="deepseek-chat",
    api_key="sk-xxx",
    base_url="https://api.deepseek.com/v1",
    temperature=0.1,
)
```

## DashScope/Qwen 接入

```python
llm = ChatOpenAI(
    model="qwen-max",
    api_key="sk-xxx",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    temperature=0.1,
)
```

## 切换方式

通过 `LLM_PROVIDER` 环境变量切换：`deepseek`（默认）或 `dashscope`

## 流式输出

设置 `streaming=True` 参数即可启用流式输出。
