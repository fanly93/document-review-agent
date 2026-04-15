/**
 * P03 — 自动审核进度页 /tasks/:taskId/reviewing
 * WebSocket 订阅：auto_review_layer_update, auto_review_complete, auto_review_failed
 * 约束：禁止展示任何审核结论；禁止手动触发 HITL；禁止轮询
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Layers, Search, Brain, CheckCircle2, Loader2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { connectAutoReviewWebSocket, type WsMessage } from '../api/client';

interface LayerState {
  status: 'pending' | 'running' | 'done' | 'failed';
  message?: string;
}

const LAYERS = [
  { key: 'layer1', label: 'Layer 1：格式校验 & 文档分类', icon: Layers, weight: '5%', desc: '格式校验 & 文档分类中...' },
  { key: 'layer2', label: 'Layer 2：条款识别 & 规则匹配', icon: Search, weight: '35%', desc: '条款识别 & 规则匹配中...' },
  { key: 'layer3', label: 'Layer 3：LLM 深度分析', icon: Brain, weight: '60%', desc: 'LLM 深度分析中...' },
];

export function ReviewingPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const wsRef = useRef<any>(null);

  const [layers, setLayers] = useState<Record<string, LayerState>>({
    layer1: { status: 'running' },
    layer2: { status: 'pending' },
    layer3: { status: 'pending' },
  });
  const [failed, setFailed] = useState<{ errorCode?: string; retryCount?: number } | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    if (!taskId) return;

    const ws = connectAutoReviewWebSocket(taskId, (msg: WsMessage) => {
      switch (msg.event) {
        case 'auto_review_layer1':
          setLayers((prev) => ({
            ...prev,
            layer1: { status: 'done' },
            layer2: { status: 'running' },
          }));
          break;
        case 'auto_review_layer2':
          setLayers((prev) => ({
            ...prev,
            layer2: { status: 'done' },
            layer3: { status: 'running' },
          }));
          break;
        case 'auto_review_layer3':
          setLayers((prev) => ({
            ...prev,
            layer3: { status: 'done' },
          }));
          break;
        case 'auto_review_complete': {
          setTimeout(() => {
            navigate(`/tasks/${taskId}`);
          }, 1000);
          break;
        }
        case 'hitl_required':
          navigate(`/tasks/${taskId}/human-review`);
          break;
        case 'task_completed':
          navigate(`/tasks/${taskId}/result`);
          break;
        case 'auto_review_failed':
          setFailed({
            errorCode: msg.data?.error_code,
            retryCount: msg.data?.retry_count,
          });
          break;
      }
    });

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => ws.close();
    wsRef.current = ws;

    return () => ws.close();
  }, [taskId]);

  const layerEntries = LAYERS.map((l) => ({
    ...l,
    state: layers[l.key],
  }));

  return (
    <div className="max-w-xl mx-auto p-8">
      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <div className="text-[14px] text-muted-foreground">任务 ID</div>
        <div className="text-[15px] font-mono">{taskId}</div>
      </div>

      <h2 className="mb-2">自动审核进度</h2>

      {/* 约束说明 */}
      <div className="flex items-center gap-2 mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <Info className="w-4 h-4 text-blue-500 shrink-0" />
        <span className="text-[13px] text-blue-700">AI 辅助初审，仅供参考。审核结论将在完成后统一展示。</span>
      </div>

      {/* 连接状态 */}
      <div className="flex items-center gap-2 mb-4 text-[12px]">
        <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
        <span className="text-muted-foreground">{wsConnected ? 'WebSocket 已连接' : '正在连接...'}</span>
      </div>

      {/* AutoReviewProgressPanel - 三层进度 */}
      {!failed && (
        <div className="space-y-4">
          {layerEntries.map((l) => {
            const Icon = l.icon;
            const s = l.state;
            return (
              <div key={l.key} className={`p-4 rounded-lg border ${
                s.status === 'done' ? 'border-green-200 bg-green-50' :
                s.status === 'running' ? 'border-primary/30 bg-primary/5' :
                'border-border bg-card'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    s.status === 'done' ? 'bg-green-100 text-green-600' :
                    s.status === 'running' ? 'bg-primary/10 text-primary' :
                    'bg-accent text-muted-foreground'
                  }`}>
                    {s.status === 'done' ? <CheckCircle2 className="w-4 h-4" /> :
                     s.status === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> :
                     <Icon className="w-4 h-4" />}
                  </div>
                  <div className="flex-1">
                    <div className="text-[14px]">{l.label}</div>
                    <div className="text-[12px] text-muted-foreground">
                      权重 {l.weight} {s.status === 'running' && `— ${l.desc}`}
                    </div>
                  </div>
                  {s.status === 'done' && (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 错误状态区 */}
      {failed && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-6 text-center">
          <XCircle className="w-12 h-12 mx-auto text-destructive mb-3" />
          <h3 className="mb-2">自动审核失败</h3>
          <p className="text-[14px] text-muted-foreground mb-1">
            错误代码：{failed.errorCode || '未知'}
          </p>
          <p className="text-[13px] text-muted-foreground mb-4">
            已重试 {failed.retryCount || 0} 次
          </p>
          <div className="flex gap-3 justify-center">
            <button
              disabled
              className="px-5 py-2 bg-primary text-primary-foreground rounded-lg opacity-50 cursor-not-allowed flex items-center gap-1.5"
              title="后端未开发：POST /api/v1/tasks/{task_id}/retry"
            >
              <AlertTriangle className="w-4 h-4" />
              手动重试（功能开发中）
            </button>
            <button
              onClick={() => navigate(`/tasks/${taskId}/failed`)}
              className="px-5 py-2 border border-border rounded-lg hover:bg-accent text-[14px]"
            >
              查看详情
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
