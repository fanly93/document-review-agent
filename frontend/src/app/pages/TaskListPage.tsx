/**
 * P06 — 任务列表页 /tasks
 * 数据依赖：GET /api/v1/documents（支持分页 + 过滤）
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, Search, Filter, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { getDocuments } from '../api/client';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  uploaded: { label: '已上传', color: 'bg-gray-400' },
  parsing: { label: '解析中', color: 'bg-blue-400' },
  parsed: { label: '已解析', color: 'bg-blue-500' },
  auto_reviewing: { label: '自动审核中', color: 'bg-indigo-400' },
  auto_reviewed: { label: '已自动审核', color: 'bg-indigo-500' },
  human_reviewing: { label: '人工审核中', color: 'bg-orange-400' },
  completed: { label: '已完成', color: 'bg-green-500' },
  rejected: { label: '已驳回', color: 'bg-red-500' },
  parse_failed: { label: '解析失败', color: 'bg-red-400' },
  auto_review_failed: { label: '审核失败', color: 'bg-red-400' },
  human_review_failed: { label: '人工审核失败', color: 'bg-red-400' },
};

const FILTER_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'uploaded,parsing,parsed,auto_reviewing,auto_reviewed,human_reviewing', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'parse_failed,auto_review_failed,human_review_failed', label: '失败' },
  { value: 'rejected', label: '已驳回' },
];

export function TaskListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [page, statusFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getDocuments({
        page,
        page_size: pageSize,
        status: statusFilter || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      // API 未连接时显示空状态
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = searchTerm
    ? items.filter((i) => i.original_filename?.toLowerCase().includes(searchTerm.toLowerCase()))
    : items;

  const totalPages = Math.ceil(total / pageSize) || 1;

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleString('zh-CN'); } catch { return d; }
  };

  const formatSize = (b: number) => {
    if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
    return `${(b / 1024).toFixed(0)} KB`;
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="mb-4">任务列表</h1>

      {/* 筛选/搜索栏 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索文档名..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-[14px] bg-background"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="border border-border rounded-lg px-3 py-2 text-[14px] bg-background"
          >
            {FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* TaskTable */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-border bg-accent/50">
              <th className="text-left px-4 py-3">文档名</th>
              <th className="text-left px-4 py-3">上传时间</th>
              <th className="text-left px-4 py-3">状态</th>
              <th className="text-left px-4 py-3">文件大小</th>
              <th className="text-left px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  暂无任务数据
                  <div className="text-[12px] mt-1">请先上传文档或连接后端 API</div>
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const st = STATUS_LABELS[item.task_status] || { label: item.task_status, color: 'bg-gray-400' };
                return (
                  <tr
                    key={item.task_id}
                    className="border-b border-border hover:bg-accent/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/tasks/${item.task_id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[280px]">{item.original_filename}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-[13px]">{formatDate(item.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[12px]">
                        <span className={`w-2 h-2 rounded-full ${st.color}`} />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">{formatSize(item.file_size_bytes)}</td>
                    <td className="px-4 py-3">
                      <button className="text-[13px] text-primary hover:underline">查看</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {total > 0 && (
        <div className="flex items-center justify-between mt-4 text-[13px] text-muted-foreground">
          <span>共 {total} 条</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded border border-border hover:bg-accent disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded border border-border hover:bg-accent disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}