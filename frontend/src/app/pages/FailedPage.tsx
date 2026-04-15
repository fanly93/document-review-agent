/**
 * P08 — 失败处理页 /tasks/:taskId/failed
 * 根据失败类型展示不同操作
 * 后端未开发接口：
 *   POST /api/v1/tasks/{task_id}/retry（手动重试）
 *   POST /api/v1/tasks/{task_id}/reassign（重新分配）
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { Loader2, XCircle, Upload, RefreshCw, Users, Headphones, AlertTriangle } from 'lucide-react';
import { getTaskDetail } from '../api/client';

const FAIL_INFO: Record<string, { title: string; desc: string; category: string }> = {
  parse_failed: {
    title: '文档解析失败',
    desc: '文档在解析阶段出现错误，可能是文件损坏、格式不兼容或 OCR 质量过低。',
    category: '解析错误',
  },
  auto_review_failed: {
    title: '自动审核失败',
    desc: '自动审核过程中出现异常，可能是模型超时或内部处理错误。',
    category: '审核错误',
  },
  human_review_failed: {
    title: '人工审核失败',
    desc: '人工审核过程中出现异常，可能需要重新分配审核人或联系管理员。',
    category: '审核错误',
  },
};

export function FailedPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<any>(null);

  useEffect(() => {
    if (!taskId) return;
    loadData();
  }, [taskId]);

  const loadData = async () => {
    try {
      const detail = await getTaskDetail(taskId!);
      const s = detail.task.status;
      if (!s.includes('failed')) {
        navigate(`/tasks/${taskId}`);
        return;
      }
      setTask(detail);
    } catch { /* empty */ }
    finally { setLoading(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  if (!task) {
    return (
      <div className="max-w-xl mx-auto p-8 text-center">
        <AlertTriangle className="w-10 h-10 mx-auto text-destructive mb-3" />
        <p className="text-[14px] text-muted-foreground">任务不存在或加载失败</p>
      </div>
    );
  }

  const status = task.task.status as string;
  const info = FAIL_INFO[status] || { title: '处理失败', desc: '出现未知错误', category: '未知' };

  return (
    <div className="max-w-xl mx-auto p-8">
      {/* 失败状态说明区 */}
      <div className="text-center mb-8">
        <XCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
        <h1 className="mb-2">{info.title}</h1>
        <div className="inline-flex items-center gap-1.5 mb-3">
          <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[12px]">{status}</span>
          <span className="px-2 py-0.5 rounded bg-accent text-[12px]">{info.category}</span>
        </div>
        <p className="text-[14px] text-muted-foreground max-w-md mx-auto">{info.desc}</p>
      </div>

      {/* 操作区 - 根据失败类型动态显示 */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-3">
        {status === 'parse_failed' && (
          <>
            <Link
              to="/upload"
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
            >
              <Upload className="w-4 h-4" /> 重新上传文档
            </Link>
            <button className="w-full flex items-center justify-center gap-2 px-5 py-3 border border-border rounded-lg hover:bg-accent text-[14px]">
              <Headphones className="w-4 h-4" /> 联系技术支持
            </button>
          </>
        )}

        {status === 'auto_review_failed' && (
          <>
            {/* 
              手动重试 — 【后端未开发】
              POST /api/v1/tasks/{task_id}/retry 接口尚未实现
            */}
            <button
              disabled
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-primary text-primary-foreground rounded-lg opacity-50 cursor-not-allowed"
              title="后端未开发：POST /api/v1/tasks/{task_id}/retry"
            >
              <RefreshCw className="w-4 h-4" /> 手动重试（功能开发中）
            </button>
            <div className="text-[11px] text-yellow-600 text-center flex items-center justify-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              POST /api/v1/tasks/{'{task_id}'}/retry 接口后端未开发
            </div>
            <button className="w-full flex items-center justify-center gap-2 px-5 py-3 border border-border rounded-lg hover:bg-accent text-[14px]">
              <Users className="w-4 h-4" /> 升级人工审核
            </button>
          </>
        )}

        {status === 'human_review_failed' && (
          <>
            {/* 
              重新分配 — 【后端未开发】
              POST /api/v1/tasks/{task_id}/reassign 接口尚未实现
            */}
            <button
              disabled
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-primary text-primary-foreground rounded-lg opacity-50 cursor-not-allowed"
              title="后端未开发：POST /api/v1/tasks/{task_id}/reassign"
            >
              <Users className="w-4 h-4" /> 重新分配审核人（功能开发中）
            </button>
            <div className="text-[11px] text-yellow-600 text-center flex items-center justify-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              POST /api/v1/tasks/{'{task_id}'}/reassign 接口后端未开发
            </div>
            <button className="w-full flex items-center justify-center gap-2 px-5 py-3 border border-border rounded-lg hover:bg-accent text-[14px]">
              <Headphones className="w-4 h-4" /> 联系管理员
            </button>
          </>
        )}

        <Link
          to={`/tasks/${taskId}`}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 border border-border rounded-lg hover:bg-accent text-[14px]"
        >
          返回任务详情
        </Link>
      </div>
    </div>
  );
}
