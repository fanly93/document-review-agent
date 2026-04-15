/**
 * P05 — 人工审核（HITL）页 /tasks/:taskId/human-review
 * 数据依赖：
 *   GET /api/v1/tasks/{task_id} → task + review_result
 *   GET /api/v1/tasks/{task_id}/risk-items → 风险列表
 *   POST /api/v1/tasks/{task_id}/operations → 操作提交
 *   POST /api/v1/tasks/{task_id}/annotations → 批注
 *   POST /api/v1/tasks/{task_id}/complete → 完成审核
 *   POST /api/v1/tasks/{task_id}/reject → 整体驳回
 * 状态约束：仅 human_reviewing 可访问
 *
 * 【后端未开发】GET /api/v1/tasks/{task_id}/document → PDFViewer 无法渲染
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  Loader2, AlertTriangle, FileText, CheckCircle2, XCircle, Clock,
  AlertOctagon, Eye
} from 'lucide-react';
import { getTaskDetail, getRiskItems, submitOperation, addAnnotation, completeReview, rejectTask, type RiskItem } from '../api/client';
import { RiskScorePanel } from '../components/risk/RiskScorePanel';
import { RiskCategoryBoard, RiskItemList } from '../components/risk/RiskItemList';

export function HumanReviewPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<any>(null);
  const [riskItems, setRiskItems] = useState<RiskItem[]>([]);
  const [filterLevel, setFilterLevel] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [pendingCriticalHigh, setPendingCriticalHigh] = useState(0);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<RiskItem | null>(null);
  const [editFields, setEditFields] = useState({ risk_level: '', risk_description: '', reasoning: '' });
  const [showRejectItemModal, setShowRejectItemModal] = useState(false);
  const [rejectingItem, setRejectingItem] = useState<RiskItem | null>(null);
  const [rejectItemReason, setRejectItemReason] = useState('');
  const [showAnnotateModal, setShowAnnotateModal] = useState(false);
  const [annotatingItem, setAnnotatingItem] = useState<RiskItem | null>(null);
  const [annotationContent, setAnnotationContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    loadData();
  }, [taskId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const detail = await getTaskDetail(taskId!);
      if (detail.task.status !== 'human_reviewing') {
        navigate(`/tasks/${taskId}`);
        return;
      }
      setTask(detail);

      const items = await getRiskItems(taskId!);
      setRiskItems(items.items);
      // 计算待处理 Critical/High 数量
      const pending = items.items.filter(
        (i) => ['critical', 'high'].includes(i.risk_level) && i.reviewer_status === 'pending'
      ).length;
      setPendingCriticalHigh(pending);
    } catch (err: any) {
      toast.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (item: RiskItem) => {
    try {
      const res = await submitOperation(taskId!, {
        risk_item_id: item.id,
        action: 'approve',
        operated_at: new Date().toISOString(),
      });
      // 乐观更新
      setRiskItems((prev) =>
        prev.map((i) => i.id === item.id ? { ...i, reviewer_status: 'approved' as const } : i)
      );
      setPendingCriticalHigh(res.pending_critical_high_count);
      toast.success('已同意');
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    }
  };

  const handleEdit = (item: RiskItem) => {
    setEditingItem(item);
    setEditFields({
      risk_level: item.risk_level,
      risk_description: item.risk_description,
      reasoning: item.reasoning || '',
    });
    setShowEditModal(true);
  };

  const submitEdit = async () => {
    if (!editingItem) return;
    setIsSubmitting(true);
    try {
      const res = await submitOperation(taskId!, {
        risk_item_id: editingItem.id,
        action: 'edit',
        edited_fields: editFields,
        operated_at: new Date().toISOString(),
      });
      setRiskItems((prev) =>
        prev.map((i) => i.id === editingItem.id ? {
          ...i,
          risk_level: editFields.risk_level as any,
          risk_description: editFields.risk_description,
          reasoning: editFields.reasoning || null,
          reviewer_status: 'edited' as const,
        } : i)
      );
      setPendingCriticalHigh(res.pending_critical_high_count);
      setShowEditModal(false);
      toast.success('编辑已保存');
    } catch (err: any) {
      toast.error(err?.message || '编辑失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectItem = (item: RiskItem) => {
    setRejectingItem(item);
    setRejectItemReason('');
    setShowRejectItemModal(true);
  };

  const submitRejectItem = async () => {
    if (!rejectingItem || rejectItemReason.length < 10) return;
    setIsSubmitting(true);
    try {
      const res = await submitOperation(taskId!, {
        risk_item_id: rejectingItem.id,
        action: 'reject_item',
        reject_reason: rejectItemReason,
        operated_at: new Date().toISOString(),
      });
      setRiskItems((prev) =>
        prev.map((i) => i.id === rejectingItem.id ? { ...i, reviewer_status: 'reviewer_rejected' as const } : i)
      );
      setPendingCriticalHigh(res.pending_critical_high_count);
      setShowRejectItemModal(false);
      toast.success('已驳回');
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnnotate = (item: RiskItem) => {
    setAnnotatingItem(item);
    setAnnotationContent('');
    setShowAnnotateModal(true);
  };

  const submitAnnotation = async () => {
    if (!annotatingItem || !annotationContent.trim()) return;
    setIsSubmitting(true);
    try {
      await addAnnotation(taskId!, {
        risk_item_id: annotatingItem.id,
        content: annotationContent,
      });
      setShowAnnotateModal(false);
      toast.success('批注已添加');
    } catch (err: any) {
      toast.error(err?.message || '批注失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async () => {
    if (pendingCriticalHigh > 0) {
      toast.error(`还有 ${pendingCriticalHigh} 条 Critical/High 风险项未处理`);
      return;
    }
    try {
      const res = await completeReview(taskId!);
      toast.success('审核已完成');
      navigate(`/tasks/${taskId}/result`);
    } catch (err: any) {
      toast.error(err?.message || '完成审核失败');
    }
  };

  const handleRejectTask = async () => {
    if (rejectReason.length < 20) return;
    setIsSubmitting(true);
    try {
      await rejectTask(taskId!, rejectReason);
      toast.success('任务已驳回');
      setShowRejectModal(false);
      navigate(`/tasks/${taskId}`);
    } catch (err: any) {
      toast.error(err?.message || '驳回失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const r = task?.review_result;
  const totalItems = riskItems.length;
  const handledItems = riskItems.filter((i) => i.reviewer_status !== 'pending').length;
  const slaDeadline = task?.task?.sla_deadline;

  return (
    <div className="flex flex-col h-full">
      {/* HumanReviewToolbar */}
      <div className="px-4 py-2.5 border-b border-border bg-card flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-[14px]">{task?.document?.original_filename}</span>
        </div>
        {r && (
          <span className="text-[13px] text-muted-foreground">
            风险评分：<span className="text-foreground">{r.overall_risk_score}</span>
          </span>
        )}
        <span className="text-[13px] text-muted-foreground">
          进度：<span className="text-foreground">{handledItems}/{totalItems}</span>
        </span>
        {slaDeadline && (
          <span className="text-[12px] text-orange-600 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            SLA：{new Date(slaDeadline).toLocaleString('zh-CN')}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setShowRejectModal(true)}
            className="px-3 py-1.5 text-[13px] border border-destructive/30 text-destructive rounded-lg hover:bg-destructive/5 flex items-center gap-1"
          >
            <XCircle className="w-3.5 h-3.5" /> 驳回任务
          </button>
          <button
            onClick={handleComplete}
            disabled={pendingCriticalHigh > 0}
            className="px-3 py-1.5 text-[13px] bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            title={pendingCriticalHigh > 0 ? `还有 ${pendingCriticalHigh} 条 Critical/High 未处理` : '完成审核'}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            完成审核
            {pendingCriticalHigh > 0 && <span className="text-[11px] opacity-80">（剩余{pendingCriticalHigh}）</span>}
          </button>
        </div>
      </div>

      {/* 双视图主体 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧 60%：PDFViewer */}
        <div className="w-[60%] border-r border-border p-4 overflow-auto">
          {/*
            PDFViewer — 【后端未开发】
            GET /api/v1/tasks/{task_id}/document 接口尚未实现
            无法渲染 PDF 原始文档，双视图联动功能整体不可用
          */}
          <div className="h-full flex flex-col items-center justify-center bg-accent/30 rounded-xl border-2 border-dashed border-border">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mb-3" />
            <h3 className="mb-1 text-yellow-800">PDF 查看器 — 后端未开发</h3>
            <p className="text-[13px] text-muted-foreground text-center max-w-sm mb-2">
              GET /api/v1/tasks/{'{task_id}'}/document 接口尚未实现
            </p>
            <p className="text-[12px] text-muted-foreground text-center max-w-sm">
              此区域将使用 PDF.js 渲染原始文档，并叠加风险等级对应颜色的高亮层。
              点击右侧风险条目将自动定位至对应页码和段落。
            </p>
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-[11px] text-yellow-700">
              <AlertOctagon className="w-3.5 h-3.5 inline mr-1" />
              建议优先排期实现此接口，否则 HITL 功能无法完整使用
            </div>

            {/* 模拟 PDF 页面定位信息 */}
            {selectedItem && (() => {
              const item = riskItems.find((i) => i.id === selectedItem);
              if (!item) return null;
              return (
                <div className="mt-4 p-3 bg-card border border-border rounded-lg text-[13px]">
                  <Eye className="w-4 h-4 inline mr-1 text-muted-foreground" />
                  将定位至：第 {item.location_page} 页，第 {item.location_paragraph} 段
                </div>
              );
            })()}
          </div>
        </div>

        {/* 右侧 40%：ReviewPanel */}
        <div className="w-[40%] overflow-auto p-4">
          {r && (
            <>
              <RiskScorePanel
                score={r.overall_risk_score}
                level={r.risk_level_summary}
                criticalCount={r.critical_count}
                highCount={r.high_count}
                mediumCount={r.medium_count}
                lowCount={r.low_count}
              />
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
            </>
          )}
          <div className="mt-2">
            <RiskItemList
              items={riskItems}
              readonly={false}
              selectedItemId={selectedItem}
              filterLevel={filterLevel}
              onFilterChange={setFilterLevel}
              onItemClick={(item) => setSelectedItem(item.id)}
              onApprove={handleApprove}
              onEdit={handleEdit}
              onRejectItem={handleRejectItem}
              onAnnotate={handleAnnotate}
            />
          </div>
        </div>
      </div>

      {/* RejectTaskModal - 整体驳回确认弹窗 */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl p-6 w-full max-w-md shadow-xl border border-border">
            <h3 className="mb-1 flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-destructive" />
              确认驳回整体任务
            </h3>
            <p className="text-[13px] text-muted-foreground mb-4">
              驳回后任务将进入 rejected 终态，不可恢复。请填写驳回原因（至少 20 个字符）。
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请输入驳回原因..."
              className="w-full border border-border rounded-lg p-3 text-[14px] h-28 resize-none bg-background"
            />
            <div className="text-[11px] text-muted-foreground mt-1">
              {rejectReason.length}/20 字符 {rejectReason.length >= 20 && '✓'}
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="px-4 py-2 text-[14px] border border-border rounded-lg hover:bg-accent"
              >
                取消
              </button>
              <button
                onClick={handleRejectTask}
                disabled={rejectReason.length < 20 || isSubmitting}
                className="px-4 py-2 text-[14px] bg-destructive text-destructive-foreground rounded-lg disabled:opacity-50"
              >
                {isSubmitting ? '提交中...' : '确认驳回'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EditFormModal - 编辑表单弹窗 */}
      {showEditModal && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl p-6 w-full max-w-lg shadow-xl border border-border">
            <h3 className="mb-4">编辑风险条目</h3>

            {/* 只读字段 */}
            <div className="space-y-2 mb-4 p-3 bg-accent/50 rounded-lg text-[13px]">
              <div><span className="text-muted-foreground">风险类型：</span>{editingItem.risk_type}（不可编辑）</div>
              <div><span className="text-muted-foreground">原文定位：</span>第{editingItem.location_page}页 第{editingItem.location_paragraph}段（不可编辑）</div>
              <div><span className="text-muted-foreground">置信度：</span>{editingItem.confidence_score}%（不可编辑）</div>
            </div>

            {/* 可编辑字段 */}
            <div className="space-y-3">
              <div>
                <label className="text-[13px] text-muted-foreground mb-1 block">风险等级</label>
                <select
                  value={editFields.risk_level}
                  onChange={(e) => setEditFields((p) => ({ ...p, risk_level: e.target.value }))}
                  className="w-full border border-border rounded-lg p-2 text-[14px] bg-background"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="text-[13px] text-muted-foreground mb-1 block">风险描述</label>
                <textarea
                  value={editFields.risk_description}
                  onChange={(e) => setEditFields((p) => ({ ...p, risk_description: e.target.value }))}
                  className="w-full border border-border rounded-lg p-2 text-[14px] h-24 resize-none bg-background"
                />
              </div>
              <div>
                <label className="text-[13px] text-muted-foreground mb-1 block">AI 推理说明</label>
                <textarea
                  value={editFields.reasoning}
                  onChange={(e) => setEditFields((p) => ({ ...p, reasoning: e.target.value }))}
                  className="w-full border border-border rounded-lg p-2 text-[14px] h-20 resize-none bg-background"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-[14px] border border-border rounded-lg hover:bg-accent">
                取消
              </button>
              <button onClick={submitEdit} disabled={isSubmitting} className="px-4 py-2 text-[14px] bg-primary text-primary-foreground rounded-lg disabled:opacity-50">
                {isSubmitting ? '保存中...' : '保存修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 单条驳回弹窗 */}
      {showRejectItemModal && rejectingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl p-6 w-full max-w-md shadow-xl border border-border">
            <h3 className="mb-2">驳回风险条目</h3>
            <p className="text-[13px] text-muted-foreground mb-3">请填写驳回原因（至少 10 个字符）</p>
            <textarea
              value={rejectItemReason}
              onChange={(e) => setRejectItemReason(e.target.value)}
              placeholder="请输入驳回原因..."
              className="w-full border border-border rounded-lg p-3 text-[14px] h-24 resize-none bg-background"
            />
            <div className="text-[11px] text-muted-foreground mt-1">
              {rejectItemReason.length}/10 字符
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setShowRejectItemModal(false)} className="px-4 py-2 text-[14px] border border-border rounded-lg hover:bg-accent">取消</button>
              <button onClick={submitRejectItem} disabled={rejectItemReason.length < 10 || isSubmitting} className="px-4 py-2 text-[14px] bg-destructive text-destructive-foreground rounded-lg disabled:opacity-50">
                {isSubmitting ? '提交中...' : '确认驳回'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批注弹窗 */}
      {showAnnotateModal && annotatingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl p-6 w-full max-w-md shadow-xl border border-border">
            <h3 className="mb-2">添加批注</h3>
            <p className="text-[13px] text-muted-foreground mb-3">批注不影响处理状态，仅作为附加说明。</p>
            <textarea
              value={annotationContent}
              onChange={(e) => setAnnotationContent(e.target.value)}
              placeholder="请输入批注内容..."
              className="w-full border border-border rounded-lg p-3 text-[14px] h-24 resize-none bg-background"
            />
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setShowAnnotateModal(false)} className="px-4 py-2 text-[14px] border border-border rounded-lg hover:bg-accent">取消</button>
              <button onClick={submitAnnotation} disabled={!annotationContent.trim() || isSubmitting} className="px-4 py-2 text-[14px] bg-primary text-primary-foreground rounded-lg disabled:opacity-50">
                {isSubmitting ? '提交中...' : '添加批注'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
