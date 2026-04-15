/**
 * P04 — 审核结果页 /tasks/:taskId/result（只读）
 * 数据依赖：
 *   GET /api/v1/tasks/{task_id} → task + document + review_result
 *   GET /api/v1/tasks/{task_id}/risk-items → 风险项列表
 *   GET /api/v1/tasks/{task_id}/result → 审核报告
 * 状态约束：仅 completed 状态可访问
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { Loader2, AlertTriangle, FileText, Download, ClipboardList } from 'lucide-react';
import { getTaskDetail, getRiskItems, type RiskItem } from '../api/client';
import { RiskScorePanel } from '../components/risk/RiskScorePanel';
import { RiskCategoryBoard, RiskItemList } from '../components/risk/RiskItemList';

export function ResultPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState<any>(null);
  const [riskItems, setRiskItems] = useState<RiskItem[]>([]);
  const [filterLevel, setFilterLevel] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) return;
    loadData();
  }, [taskId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const detail = await getTaskDetail(taskId!);

      // 路由守卫：仅 completed 状态
      if (detail.task.status !== 'completed') {
        navigate(`/tasks/${taskId}`);
        return;
      }

      setTask(detail);

      const items = await getRiskItems(taskId!);
      setRiskItems(items.items);
    } catch (err: any) {
      setError(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="max-w-xl mx-auto p-8 text-center">
        <AlertTriangle className="w-10 h-10 mx-auto text-destructive mb-3" />
        <p className="text-[14px] text-muted-foreground">{error || '数据加载失败'}</p>
      </div>
    );
  }

  const r = task.review_result;

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* 文档信息 */}
      <div className="flex items-center gap-3 mb-6">
        <FileText className="w-5 h-5 text-muted-foreground" />
        <div>
          <h2 className="mb-0">{task.document.original_filename}</h2>
          <div className="text-[13px] text-muted-foreground">审核结果 — 只读查阅</div>
        </div>
      </div>

      <div className="flex gap-6">
        {/* 主体区域 */}
        <div className="flex-1 min-w-0">
          {/* Level 1: RiskScorePanel */}
          {r && (
            <RiskScorePanel
              score={r.overall_risk_score}
              level={r.risk_level_summary}
              criticalCount={r.critical_count}
              highCount={r.high_count}
              mediumCount={r.medium_count}
              lowCount={r.low_count}
            />
          )}

          {/* Level 2: RiskCategoryBoard */}
          {r && (
            <div className="mt-4">
              <RiskCategoryBoard
                criticalCount={r.critical_count}
                highCount={r.high_count}
                mediumCount={r.medium_count}
                lowCount={r.low_count}
                activeFilter={filterLevel}
                onFilter={setFilterLevel}
              />
            </div>
          )}

          {/* Level 3 & 4: RiskItemList + RiskItemDetail */}
          <div className="mt-4">
            <RiskItemList
              items={riskItems}
              readonly={true}
              filterLevel={filterLevel}
              onFilterChange={setFilterLevel}
            />
          </div>

          {/* 底部操作区 */}
          <div className="mt-6 flex gap-3 pt-4 border-t border-border">
            <button
              disabled
              className="px-4 py-2 text-[14px] border border-border rounded-lg flex items-center gap-1.5 opacity-50 cursor-not-allowed"
              title="导出报告（MVP 可选功能）"
            >
              <Download className="w-4 h-4" /> 导出报告（开发中）
            </button>
            <Link
              to={`/tasks/${taskId}`}
              className="px-4 py-2 text-[14px] border border-border rounded-lg flex items-center gap-1.5 hover:bg-accent"
            >
              <ClipboardList className="w-4 h-4" /> 查看审计日志
            </Link>
          </div>
        </div>

        {/* 侧边栏：FactExtractionPanel */}
        <div className="w-72 shrink-0">
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="mb-3 flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              合同事实字段
            </h4>
            {/* 
              FactExtractionPanel — 【后端未开发】
              GET /api/v1/tasks/{task_id}/extractions 接口尚未实现
              短期隐藏组件内容，待后端实现后启用
            */}
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
              <AlertTriangle className="w-5 h-5 mx-auto text-yellow-600 mb-1.5" />
              <div className="text-[13px] text-yellow-800">后端未开发</div>
              <div className="text-[11px] text-yellow-600 mt-0.5">
                GET /api/v1/tasks/{'{task_id}'}/extractions
                <br />接口尚未实现
              </div>
              <div className="text-[11px] text-muted-foreground mt-2">
                合同主体 / 金额 / 期限 / 关键日期
                <br />待后端实现后自动启用
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}