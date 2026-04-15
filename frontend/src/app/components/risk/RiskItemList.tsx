/**
 * RiskItemList + RiskItemDetail + RiskCategoryBoard
 * 可过滤/排序的风险条目列表
 * 置信度颜色由后端 confidence_category 决定（fact=绿, clause=黄, legal=橙）
 * P04 完全只读；P05 可操作
 */
import { useState } from 'react';
import {
  ChevronDown, ChevronUp, MapPin, BookOpen, AlertTriangle,
  CheckCircle2, Edit3, XCircle, MessageSquare, Filter
} from 'lucide-react';
import type { RiskItem } from '../../api/client';

const RISK_LEVEL_CONFIG: Record<string, { color: string; bg: string; label: string; border: string }> = {
  critical: { color: 'text-red-700', bg: 'bg-red-100', label: 'Critical', border: 'border-l-red-500' },
  high: { color: 'text-orange-700', bg: 'bg-orange-100', label: 'High', border: 'border-l-orange-500' },
  medium: { color: 'text-yellow-700', bg: 'bg-yellow-100', label: 'Medium', border: 'border-l-yellow-500' },
  low: { color: 'text-green-700', bg: 'bg-green-100', label: 'Low', border: 'border-l-green-500' },
};

const CONFIDENCE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  fact: { color: 'text-green-700', bg: 'bg-green-100', label: '事实提取' },
  clause: { color: 'text-yellow-700', bg: 'bg-yellow-100', label: '条款检查' },
  legal: { color: 'text-orange-700', bg: 'bg-orange-100', label: '风险评估' },
};

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: any }> = {
  pending: { color: 'text-muted-foreground', label: '待处理', icon: null },
  approved: { color: 'text-green-600', label: '已同意', icon: CheckCircle2 },
  edited: { color: 'text-blue-600', label: '已编辑', icon: Edit3 },
  reviewer_rejected: { color: 'text-red-600', label: '已驳回', icon: XCircle },
};

interface Props {
  items: RiskItem[];
  readonly?: boolean;
  onItemClick?: (item: RiskItem) => void;
  onApprove?: (item: RiskItem) => void;
  onEdit?: (item: RiskItem) => void;
  onRejectItem?: (item: RiskItem) => void;
  onAnnotate?: (item: RiskItem) => void;
  selectedItemId?: string | null;
  filterLevel?: string | null;
  onFilterChange?: (level: string | null) => void;
}

export function RiskCategoryBoard({
  criticalCount, highCount, mediumCount, lowCount,
  activeFilter, onFilter,
}: {
  criticalCount: number; highCount: number; mediumCount: number; lowCount: number;
  activeFilter?: string | null;
  onFilter?: (level: string | null) => void;
}) {
  const categories = [
    { level: 'critical', label: 'Critical', count: criticalCount, color: 'bg-red-500', bgLight: 'bg-red-50 border-red-200' },
    { level: 'high', label: 'High', count: highCount, color: 'bg-orange-500', bgLight: 'bg-orange-50 border-orange-200' },
    { level: 'medium', label: 'Medium', count: mediumCount, color: 'bg-yellow-500', bgLight: 'bg-yellow-50 border-yellow-200' },
    { level: 'low', label: 'Low', count: lowCount, color: 'bg-green-500', bgLight: 'bg-green-50 border-green-200' },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 mb-4">
      {categories.map((c) => (
        <button
          key={c.level}
          onClick={() => onFilter?.(activeFilter === c.level ? null : c.level)}
          className={`p-3 rounded-lg border text-center transition-all ${
            activeFilter === c.level ? c.bgLight + ' ring-1 ring-offset-1' : 'border-border bg-card hover:bg-accent'
          }`}
        >
          <div className="text-[22px]">{c.count}</div>
          <div className="flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
            <div className={`w-2 h-2 rounded-sm ${c.color}`} />
            {c.label}
          </div>
        </button>
      ))}
    </div>
  );
}

export function RiskItemList({
  items, readonly = true, onItemClick, onApprove, onEdit, onRejectItem, onAnnotate,
  selectedItemId, filterLevel, onFilterChange,
}: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const levelOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  let filtered = filterLevel ? items.filter((i) => i.risk_level === filterLevel) : items;
  filtered = [...filtered].sort((a, b) => {
    const diff = (levelOrder[a.risk_level] ?? 9) - (levelOrder[b.risk_level] ?? 9);
    return sortOrder === 'desc' ? diff : -diff;
  });

  return (
    <div>
      {/* 过滤/排序栏 */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          <span>{filtered.length} 条风险项</span>
          {filterLevel && (
            <button
              onClick={() => onFilterChange?.(null)}
              className="ml-1 px-1.5 py-0.5 bg-accent rounded text-[11px] hover:bg-border"
            >
              清除过滤 ×
            </button>
          )}
        </div>
        <button
          onClick={() => setSortOrder((p) => p === 'desc' ? 'asc' : 'desc')}
          className="ml-auto text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          风险等级{sortOrder === 'desc' ? '↓' : '↑'}
        </button>
      </div>

      <div className="space-y-2">
        {filtered.map((item) => {
          const rlCfg = RISK_LEVEL_CONFIG[item.risk_level] || RISK_LEVEL_CONFIG.medium;
          const ccCfg = CONFIDENCE_CONFIG[item.confidence_category] || CONFIDENCE_CONFIG.clause;
          const stCfg = STATUS_CONFIG[item.reviewer_status] || STATUS_CONFIG.pending;
          const expanded = expandedIds.has(item.id);
          const isSelected = selectedItemId === item.id;

          return (
            <div
              key={item.id}
              className={`border border-border rounded-lg overflow-hidden border-l-4 ${rlCfg.border} ${
                isSelected ? 'ring-2 ring-primary/30' : ''
              }`}
            >
              {/* 摘要行 */}
              <div
                className="p-3 flex items-start gap-3 cursor-pointer hover:bg-accent/50"
                onClick={() => {
                  onItemClick?.(item);
                  toggleExpand(item.id);
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-[11px] ${rlCfg.bg} ${rlCfg.color}`}>
                      {rlCfg.label}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[11px] ${ccCfg.bg} ${ccCfg.color}`}>
                      {ccCfg.label} {item.confidence_score.toFixed(0)}%
                    </span>
                    {stCfg.icon && (
                      <span className={`flex items-center gap-0.5 text-[11px] ${stCfg.color}`}>
                        <stCfg.icon className="w-3 h-3" />
                        {stCfg.label}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] line-clamp-2">{item.risk_description}</p>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <MapPin className="w-3 h-3" />
                      第{item.location_page}页 第{item.location_paragraph}段
                    </span>
                    <span>{item.risk_type}</span>
                  </div>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground mt-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground mt-1" />}
              </div>

              {/* RiskItemDetail - 展开详情 */}
              {expanded && (
                <div className="border-t border-border p-4 bg-card/50">
                  <div className="space-y-3">
                    {/* 完整描述 */}
                    <div>
                      <div className="text-[12px] text-muted-foreground mb-0.5">风险描述</div>
                      <div className="text-[13px]">{item.risk_description}</div>
                    </div>

                    {/* 置信度说明 */}
                    <div>
                      <div className="text-[12px] text-muted-foreground mb-0.5">置信度分类</div>
                      <div className="text-[13px]">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${ccCfg.bg} ${ccCfg.color}`}>
                          {ccCfg.label}（{item.confidence_score.toFixed(1)}%）
                        </span>
                      </div>
                    </div>

                    {/* AI 推理说明 - legal 类别时必显 */}
                    {(item.confidence_category === 'legal' || item.reasoning) && (
                      <div>
                        <div className="text-[12px] text-muted-foreground mb-0.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-orange-500" />
                          AI 推理说明
                          {item.confidence_category === 'legal' && (
                            <span className="text-[10px] text-orange-600">（低置信度，必须展示）</span>
                          )}
                        </div>
                        <div className="text-[13px] bg-orange-50 border border-orange-200 rounded p-2">
                          {item.reasoning || '（推理说明为空，请关注此条目）'}
                        </div>
                      </div>
                    )}

                    {/* 原文定位 */}
                    <div>
                      <div className="text-[12px] text-muted-foreground mb-0.5">原文定位</div>
                      <div className="text-[13px] flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        第 {item.location_page} 页，第 {item.location_paragraph} 段
                      </div>
                    </div>

                    {/* SourceReferencePanel - 法规引用 */}
                    {item.source_references.length > 0 && (
                      <div>
                        <div className="text-[12px] text-muted-foreground mb-1 flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          来源引用
                        </div>
                        <div className="space-y-1.5">
                          {item.source_references.map((ref, idx) => (
                            <div key={idx} className="text-[12px] bg-accent/50 rounded p-2 border border-border">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="px-1 py-0 rounded bg-accent text-[10px]">{ref.source_type}</span>
                                <span>{ref.source_name}</span>
                                {ref.article_number && <span className="text-muted-foreground">{ref.article_number}</span>}
                              </div>
                              {ref.reference_text && (
                                <div className="text-muted-foreground mt-0.5 italic">"{ref.reference_text}"</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* OperationButtonGroup - P05 可操作 */}
                    {!readonly && item.reviewer_status === 'pending' && (
                      <div className="flex gap-2 pt-2 border-t border-border">
                        <button
                          onClick={() => onApprove?.(item)}
                          className="px-3 py-1.5 text-[13px] bg-green-100 text-green-700 rounded-lg hover:bg-green-200 flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> 同意
                        </button>
                        <button
                          onClick={() => onEdit?.(item)}
                          className="px-3 py-1.5 text-[13px] bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> 编辑
                        </button>
                        <button
                          onClick={() => onRejectItem?.(item)}
                          className="px-3 py-1.5 text-[13px] bg-red-100 text-red-700 rounded-lg hover:bg-red-200 flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" /> 驳回
                        </button>
                        <button
                          onClick={() => onAnnotate?.(item)}
                          className="px-3 py-1.5 text-[13px] bg-accent text-foreground rounded-lg hover:bg-border flex items-center gap-1"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> 批注
                        </button>
                      </div>
                    )}

                    {/* 已处理状态标记 */}
                    {!readonly && item.reviewer_status !== 'pending' && (
                      <div className={`flex items-center gap-1.5 pt-2 border-t border-border text-[13px] ${stCfg.color}`}>
                        {stCfg.icon && <stCfg.icon className="w-4 h-4" />}
                        {stCfg.label}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
