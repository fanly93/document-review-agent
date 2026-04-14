#!/bin/bash
# Task 完成验证 Hook
# 当 Teammate 标记任务完成时执行此脚本
# 退出码 2 表示拒绝完成，并将 stdout 作为反馈发回给 Teammate

TASK_ID="${CLAUDE_TASK_ID:-unknown}"
TASK_TITLE="${CLAUDE_TASK_TITLE:-unknown}"

echo "[TaskCompleted Hook] 验证任务: $TASK_TITLE (ID: $TASK_ID)"

# 示例：可在此添加自定义验证逻辑
# 例如：检查是否有未提交的文件、测试是否通过等

# 默认允许完成（退出码 0）
exit 0
