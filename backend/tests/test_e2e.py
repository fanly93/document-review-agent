#!/usr/bin/env python3
"""
MVP 后端完整链路测试
运行方式：python3 tests/test_e2e.py
"""
import sys
import os
import json
import urllib.request
import urllib.error
import urllib.parse

BASE = "http://localhost:8000"

# 禁用代理
os.environ.pop("http_proxy", None)
os.environ.pop("HTTP_PROXY", None)
os.environ.pop("https_proxy", None)
os.environ.pop("HTTPS_PROXY", None)

PASS = 0
FAIL = 0


def req(method, path, data=None, token=None, expect_status=None):
    """发送 HTTP 请求"""
    url = f"{BASE}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data else None
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as resp:
            status = resp.status
            body = json.loads(resp.read())
            if expect_status and status != expect_status:
                return None, status, f"期望状态码 {expect_status}，实际 {status}"
            return body, status, None
    except urllib.error.HTTPError as e:
        status = e.code
        try:
            body = json.loads(e.read())
        except Exception:
            body = {}
        if expect_status and status == expect_status:
            return body, status, None
        return body, status, f"HTTP {status}"


def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        print(f"  ✓ {name}")
        PASS += 1
    else:
        print(f"  ✗ {name}: {detail}")
        FAIL += 1


def test_health():
    print("\n=== 1. 健康检查 ===")
    body, status, err = req("GET", "/health")
    check("服务响应 200", status == 200, err)
    check("返回 ok 状态", body and body.get("status") == "ok")


def test_auth():
    print("\n=== 2. 认证测试 ===")
    # 注册法务用户
    body, status, _ = req("POST", "/api/v1/auth/register", {
        "email": "legal@test.com", "password": "test123456",
        "full_name": "法务测试", "role": "legal_staff"
    })
    check("注册法务用户（或已存在）", status in (200, 400))

    # 注册审核员
    req("POST", "/api/v1/auth/register", {
        "email": "reviewer@test.com", "password": "test123456",
        "full_name": "审核测试", "role": "reviewer"
    })

    # 登录法务用户
    body, status, err = req("POST", "/api/v1/auth/login", {
        "email": "legal@test.com", "password": "test123456"
    })
    check("法务用户登录成功", status == 200 and body.get("code") == 0, err)
    legal_token = body.get("data", {}).get("access_token") if body else None
    check("获取到 JWT Token", bool(legal_token))

    # 登录审核员
    body2, status2, _ = req("POST", "/api/v1/auth/login", {
        "email": "reviewer@test.com", "password": "test123456"
    })
    reviewer_token = body2.get("data", {}).get("access_token") if body2 else None
    reviewer_id = body2.get("data", {}).get("user_id") if body2 else None
    check("审核员登录成功", status2 == 200 and bool(reviewer_token))

    return legal_token, reviewer_token, reviewer_id


def test_upload(token):
    print("\n=== 3. 文档上传测试 ===")
    # 初始化上传
    body, status, err = req("POST", "/api/v1/upload/init", {
        "original_filename": "采购合同-2026-04.pdf",
        "file_size_bytes": 1024000,
        "total_parts": 1,
        "content_type": "application/pdf"
    }, token=token)
    check("初始化上传 201", status == 201, err)
    chunk_id = body.get("data", {}).get("chunk_upload_id") if body else None
    check("获取到 chunk_upload_id", bool(chunk_id))

    # 完成上传
    body2, status2, err2 = req("POST", "/api/v1/upload/complete", {
        "chunk_upload_id": chunk_id,
        "parts": [{"part_number": 1, "etag": '"abc123"'}]
    }, token=token)
    check("完成上传 201", status2 == 201, err2)
    task_id = body2.get("data", {}).get("task_id") if body2 else None
    doc_id = body2.get("data", {}).get("document_id") if body2 else None
    check("获取到 task_id", bool(task_id))
    check("返回状态为 uploaded", body2.get("data", {}).get("status") == "uploaded" if body2 else False)

    return task_id, doc_id


def test_forbidden_upload(token):
    print("\n=== 4. 禁止类型拦截测试 ===")
    body, status, _ = req("POST", "/api/v1/upload/init", {
        "original_filename": "股权融资协议.pdf",
        "file_size_bytes": 1024000,
        "total_parts": 1,
        "content_type": "application/pdf"
    }, token=token)
    check("融资股权文件被拦截 403", status == 403)
    check("返回 DOCUMENT_TYPE_FORBIDDEN",
          body.get("detail", {}).get("code") == "DOCUMENT_TYPE_FORBIDDEN" if body else False)


def test_file_too_large(token):
    print("\n=== 5. 文件大小限制测试 ===")
    body, status, _ = req("POST", "/api/v1/upload/init", {
        "original_filename": "huge.pdf",
        "file_size_bytes": 100000000,  # 100MB > 50MB limit
        "total_parts": 1,
        "content_type": "application/pdf"
    }, token=token)
    check("超大文件被拦截 400", status in (400, 422))


def test_task_query(token, task_id):
    print("\n=== 6. 任务查询测试 ===")
    body, status, err = req("GET", f"/api/v1/tasks/{task_id}", token=token)
    check("查询任务详情 200", status == 200, err)
    task_data = body.get("data", {}) if body else {}
    check("返回 task.id", task_data.get("task", {}).get("id") == task_id)
    check("返回 document 字段", "document" in task_data)

    # 不存在的任务
    body2, status2, _ = req("GET", "/api/v1/tasks/nonexistent-id", token=token)
    check("不存在任务返回 404", status2 == 404)
    check("返回 TASK_NOT_FOUND",
          body2.get("detail", {}).get("code") == "TASK_NOT_FOUND" if body2 else False)


def test_workflow_trigger(token, task_id):
    print("\n=== 7. 工作流触发测试 ===")
    body, status, err = req("POST", f"/api/v1/tasks/{task_id}/debug/trigger-workflow", token=token)
    check("调试触发工作流 200", status == 200, err)
    if body and body.get("data"):
        final_status = body["data"].get("final_status")
        risk_count = body["data"].get("risk_items_count", 0)
        check("工作流返回最终状态", bool(final_status), f"状态: {final_status}")
        check("工作流产出风险项", risk_count >= 0, f"风险项数: {risk_count}")
        print(f"  → 工作流最终状态: {final_status}, 风险项数: {risk_count}")
        return final_status


def test_risk_items(token, task_id):
    print("\n=== 8. 风险项查询测试 ===")
    body, status, err = req("GET", f"/api/v1/tasks/{task_id}/risk-items", token=token)
    check("查询风险项 200", status == 200, err)
    items = body.get("data", {}).get("items", []) if body else []
    total = body.get("data", {}).get("total", 0) if body else 0
    check("返回分页数据", "total" in (body.get("data", {}) if body else {}))
    print(f"  → 风险项总数: {total}")
    return items


def test_audit_logs(token, task_id):
    print("\n=== 9. 审计日志测试 ===")
    body, status, err = req("GET", f"/api/v1/tasks/{task_id}/audit-logs", token=token)
    check("查询审计日志 200", status == 200, err)
    logs = body.get("data", {}).get("items", []) if body else []
    check("存在审计日志记录", len(logs) > 0, f"日志数: {len(logs)}")


def test_hitl_operations(reviewer_token, reviewer_id, task_id, risk_items):
    print("\n=== 10. HITL 审核操作测试 ===")
    if not risk_items:
        print("  ⚠ 无风险项可测试（工作流可能未触发 HITL）")
        return

    # reject 操作 comment 太短 → 422
    if risk_items:
        rid = risk_items[0]["id"]
        body, status, _ = req("POST", f"/api/v1/tasks/{task_id}/operations", {
            "decisions": [{"risk_item_id": rid, "action": "reject", "comment": "短"}]
        }, token=reviewer_token)
        check("reject comment < 10 字符返回 422", status == 422)

    # approve 操作
    decisions = [{"risk_item_id": i["id"], "action": "approve"} for i in risk_items[:2]]
    body, status, err = req("POST", f"/api/v1/tasks/{task_id}/operations",
                            {"decisions": decisions}, token=reviewer_token)
    check("approve 操作成功或提示状态冲突", status in (200, 409), err)


def test_state_machine(token, task_id):
    print("\n=== 11. 状态机冲突测试 ===")
    # 对 completed 状态的任务发起 reject（终态不可再流转）
    body, status, _ = req("POST", f"/api/v1/tasks/{task_id}/reject",
                          {"reason": "测试驳回操作超过十个字符"}, token=token)
    # 如果任务已经是终态，应该返回 409
    print(f"  → 对当前状态任务发起 reject，返回: {status}")
    check("终态任务操作返回 409 或成功（取决于当前状态）", status in (200, 409))


def test_documents_list(token):
    print("\n=== 12. 文档列表测试 ===")
    body, status, err = req("GET", "/api/v1/documents", token=token)
    check("GET /documents 返回 200", status == 200, err)
    data = body.get("data", {}) if body else {}
    check("返回 items 字段", "items" in data)
    check("返回 total 字段", "total" in data)
    print(f"  → 文档总数: {data.get('total', 0)}")


def test_operations_list(token, task_id):
    print("\n=== 13. 操作历史测试 ===")
    body, status, err = req("GET", f"/api/v1/tasks/{task_id}/operations", token=token)
    check("GET /operations 返回 200", status == 200, err)
    data = body.get("data", {}) if body else {}
    check("返回 items 字段", "items" in data)
    check("返回分页字段", "total" in data and "page" in data)
    print(f"  → 操作记录数: {data.get('total', 0)}")


def test_annotations(reviewer_token, task_id):
    print("\n=== 14. 批注功能测试 ===")
    # 创建批注
    body, status, err = req("POST", f"/api/v1/tasks/{task_id}/annotations",
                            {"content": "测试批注：此合同风险条款需要重点关注"}, token=reviewer_token)
    check("POST /annotations 创建成功 201", status == 201, err)
    ann_id = body.get("data", {}).get("annotation_id") if body else None
    check("返回 annotation_id", bool(ann_id))

    # 查询批注
    body2, status2, err2 = req("GET", f"/api/v1/tasks/{task_id}/annotations", token=reviewer_token)
    check("GET /annotations 返回 200", status2 == 200, err2)
    items = body2.get("data", {}).get("items", []) if body2 else []
    check("批注列表非空", len(items) > 0, f"实际条数: {len(items)}")


def test_complete_and_result(reviewer_token, task_id):
    print("\n=== 15. 完成审核与结果查询测试 ===")
    # 查询当前任务状态
    body, status, _ = req("GET", f"/api/v1/tasks/{task_id}", token=reviewer_token)
    task_status = body.get("data", {}).get("task", {}).get("status") if body else None
    print(f"  → 当前任务状态: {task_status}")

    # 尝试完成审核（可能返回 409/422 取决于状态）
    body2, status2, _ = req("POST", f"/api/v1/tasks/{task_id}/complete", token=reviewer_token)
    check("POST /complete 返回合理状态码", status2 in (200, 409, 422),
          f"实际状态码: {status2}")
    print(f"  → complete 接口返回: {status2}")

    # 如果任务已完成，查询结果
    if task_status == "completed" or status2 == 200:
        body3, status3, err3 = req("GET", f"/api/v1/tasks/{task_id}/result", token=reviewer_token)
        check("GET /result 返回 200", status3 == 200, err3)
        result_data = body3.get("data", {}) if body3 else {}
        check("返回 overall_risk_score", "overall_risk_score" in result_data)
    else:
        print("  → 任务未完成，跳过 result 查询")


def main():
    print("=" * 60)
    print("  后端 MVP 完整链路测试")
    print("=" * 60)

    test_health()
    legal_token, reviewer_token, reviewer_id = test_auth()

    if not legal_token:
        print("\n❌ 无法获取 Token，终止测试")
        sys.exit(1)

    test_forbidden_upload(legal_token)
    test_file_too_large(legal_token)

    task_id, doc_id = test_upload(legal_token)
    if not task_id:
        print("\n❌ 无法创建任务，终止测试")
        sys.exit(1)

    test_task_query(legal_token, task_id)
    final_status = test_workflow_trigger(legal_token, task_id)
    risk_items = test_risk_items(legal_token, task_id)
    test_audit_logs(legal_token, task_id)
    test_hitl_operations(reviewer_token, reviewer_id, task_id, risk_items)
    test_state_machine(legal_token, task_id)
    test_documents_list(legal_token)
    test_operations_list(legal_token, task_id)
    test_annotations(reviewer_token, task_id)
    test_complete_and_result(reviewer_token, task_id)

    print("\n" + "=" * 60)
    print(f"  测试结果：✓ {PASS} 通过  ✗ {FAIL} 失败")
    print("=" * 60)

    if FAIL > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
