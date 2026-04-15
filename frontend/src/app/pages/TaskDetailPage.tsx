/**
 * P07 — 任务详情页（Hub）/tasks/:taskId
 * 数据依赖：
 *   GET /api/v1/tasks/{task_id}
 *   GET /api/v1/tasks/{task_id}/audit-logs
 * 根据状态动态渲染内嵌内容和跳转入口
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import {
  Loader2, AlertTriangle, CheckCircle2, Clock, XCircle, ArrowRight,
  ChevronDown, ChevronUp, FileText, Zap, Brain, UserCheck, Ban
} from 'lucide-react';
import { getTaskDetail, getAuditLogs } from '../api/client';

const STATUS_FLOW = [
  { key: 'uploaded', label: '已上传', icon: FileText },
  { key: 'parsing', label: '解析中', icon: Zap },
  { key: 'auto_reviewing', label: '自动审核', icon: Brain },
  { key: 'human_reviewing', label: '人工审核', icon: UserCheck },
  { key: 'completed', label: '已完成', icon: CheckCircle2 },
];

const STATUS_ORDER: Record<string, number> = {
  uploaded: 0, parsing: 1, parsed: 2,
  auto_reviewing: 3, auto_reviewed: 4,
  human_reviewing: 5, completed: 6,
  rejected: 6,
  parse_failed: 1, auto_review_failed: 3, human_review_failed: 5,
};

export function TaskDetailPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);

  useEffect(() => {
    if (!taskId) return;
    loadData();
  }, [taskId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const detail = await getTaskDetail(taskId!);
      setTask(detail);
    } catch (err: any) {
      // task not found
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async (pg = 1) => {
    try {
      const res = await getAuditLogs(taskId!, { page: pg, page_size: 10 });
      setAuditLogs(res.items);
      setLogsTotal(res.total);
      setLogsPage(pg);
    } catch { /* empty */ }
  };

  const toggleLogs = () => {
    if (!showLogs && auditLogs.length === 0) loadAuditLogs();
    setShowLogs(!showLogs);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!task) {
    return (
      <div className="max-w-xl mx-auto p-8 text-center">
        <AlertTriangle className="w-10 h-10 mx-auto text-destructive mb-3" />
        <p className="text-[14px] text-muted-foreground">任务不存在或加载失败</p>
        <Link to="/tasks" className="text-[14px] text-primary hover:underline mt-2 inline-block">返回任务列表</Link>
      </div>
    );
  }

  const status = task.task.status;
  const currentStep = STATUS_ORDER[status] ?? 0;
  const isFailed = status.includes('failed');
  const isRejected = status === 'rejected';

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* 任务状态卡片 */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-[15px]">{task.document.original_filename}</span>
            </div>
            <div className="text-[12px] text-muted-foreground font-mono">任务 {taskId}</div>
          </div>
          <div className={`px-3 py-1 rounded-lg text-[13px] ${
            status === 'completed' ? 'bg-green-100 text-green-700' :
            isRejected ? 'bg-red-100 text-red-700' :
            isFailed ? 'bg-red-100 text-red-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {status}
          </div>
        </div>

        {/* StatusTimeline */}
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          {STATUS_FLOW.map((step, i) => {
            const Icon = step.icon;
            const stepOrder = STATUS_ORDER[step.key] ?? i;
            const isDone = currentStep > stepOrder;
            const isActive = (currentStep === stepOrder && !isFailed && !isRejected) ||
              (step.key === 'completed' && status === 'completed');
            const isPending = !isDone && !isActive;

            return (
              <div key={step.key} className="flex items-center">
                <div className="flex flex-col items-center min-w-[70px]">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isDone ? 'bg-green-100 text-green-600' :
                    isActive ? 'bg-primary/10 text-primary ring-2 ring-primary/30' :
                    'bg-accent text-muted-foreground'
                  }`}>
                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span className={`text-[11px] mt-1 ${isPending ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {step.label}
                  </span>
                </div>
                {i < STATUS_FLOW.length - 1 && (
                  <div className={`w-8 h-0.5 mt-[-14px] ${isDone ? 'bg-green-400' : 'bg-border'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* SLA 倒计时 */}
        {status === 'human_reviewing' && task.task.sla_deadline && (
          <div className="mt-3 flex items-center gap-1.5 text-[13px] text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            <Clock className="w-4 h-4" />
            SLA 截止：{new Date(task.task.sla_deadline).toLocaleString('zh-CN')}
          </div>
        )}
      </div>

      {/* 动态内嵌内容 */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        {(status === 'uploaded' || status === 'parsing') && (
          <div className="text-center py-6">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-3" />
            <h3 className="mb-1">文档解析中</h3>
            <p className="text-[13px] text-muted-foreground mb-4">正在进行文本提取和质量检测...</p>
            <Link to={`/tasks/${taskId}/parsing`} className="inline-flex items-center gap-1 text-[14px] text-primary hover:underline">
              查看详细进度 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {(status === 'parsed' || status === 'auto_reviewing' || status === 'auto_reviewed') && (
          <div className="text-center py-6">
            <Brain className="w-8 h-8 mx-auto text-indigo-500 mb-3" />
            <h3 className="mb-1">自动审核中</h3>
            <p className="text-[13px] text-muted-foreground mb-4">AI 正在进行三层深度分析...</p>
            <Link to={`/tasks/${taskId}/reviewing`} className="inline-flex items-center gap-1 text-[14px] text-primary hover:underline">
              查看审核进度 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {status === 'human_reviewing' && (
          <div className="text-center py-6">
            <UserCheck className="w-8 h-8 mx-auto text-orange-500 mb-3" />
            <h3 className="mb-1">等待人工审核</h3>
            <p className="text-[13px] text-muted-foreground mb-4">需要人工确认高风险和低置信度条目</p>
            <Link to={`/tasks/${taskId}/human-review`} className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90">
              进入人工审核 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {status === 'completed' && (
          <div className="text-center py-6">
            <CheckCircle2 className="w-8 h-8 mx-auto text-green-500 mb-3" />
            <h3 className="mb-1">审核已完成</h3>
            {task.review_result && (
              <p className="text-[13px] text-muted-foreground mb-4">
                整体风险评分：{task.review_result.overall_risk_score} |
                风险等级：{task.review_result.risk_level_summary}
              </p>
            )}
            <Link to={`/tasks/${taskId}/result`} className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700">
              查看审核结果 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {isFailed && (
          <div className="text-center py-6">
            <XCircle className="w-8 h-8 mx-auto text-destructive mb-3" />
            <h3 className="mb-1">处理失败</h3>
            <p className="text-[13px] text-muted-foreground mb-4">任务在 {status} 阶段出现错误</p>
            <Link to={`/tasks/${taskId}/failed`} className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-destructive text-destructive-foreground rounded-lg hover:opacity-90">
              查看失败详情 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {isRejected && (
          <div className="text-center py-6">
            <Ban className="w-8 h-8 mx-auto text-red-500 mb-3" />
            <h3 className="mb-1">任务已驳回</h3>
            <p className="text-[13px] text-muted-foreground">此任务为终态，不可进行任何操作</p>
          </div>
        )}
      </div>

      {/* AuditLogPanel */}
      <div className="border border-border rounded-xl overflow-hidden">
        <button
          onClick={toggleLogs}
          className="w-full px-5 py-3 flex items-center justify-between bg-card hover:bg-accent/50 transition-colors"
        >
          <span className="text-[14px]">审计日志</span>
          {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showLogs && (
          <div className="border-t border-border p-4 bg-card/50">
            {auditLogs.length === 0 ? (
              <p className="text-[13px] text-muted-foreground text-center py-4">暂无审计日志或后端 API 未连接</p>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log: any) => (
                  <div key={log.id} className="flex items-start gap-3 text-[13px] p-2 rounded bg-accent/30">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0 rounded bg-accent text-[11px]">{log.event_type}</span>
                        <span className="text-muted-foreground text-[11px]">
                          {new Date(log.occurred_at).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      {log.detail && (
                        <div className="text-[12px] text-muted-foreground mt-0.5 font-mono">
                          {JSON.stringify(log.detail)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {logsTotal > auditLogs.length && (
                  <button
                    onClick={() => loadAuditLogs(logsPage + 1)}
                    className="text-[13px] text-primary hover:underline w-full text-center py-2"
                  >
                    加载更多...
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
