/**
 * P02 — 解析进度页 /tasks/:taskId/parsing
 * WebSocket 订阅：upload_progress, parse_progress, quality_check, parse_complete, parse_failed
 * 禁止轮询，仅 WebSocket 驱动
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Upload, FileSearch, ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { connectTaskWebSocket, type WsMessage } from '../api/client';

interface ParseState {
  stage: 'uploading' | 'extracting' | 'quality_check' | 'complete' | 'failed';
  progress: number;
  message: string;
  ocrScore?: number;
  ocrLevel?: string;
  errorCode?: string;
  errorMessage?: string;
}

const STAGES = [
  { key: 'uploading', label: '上传中', icon: Upload, range: [0, 40] },
  { key: 'extracting', label: '文本提取', icon: FileSearch, range: [40, 70] },
  { key: 'quality_check', label: '质量检测', icon: ShieldCheck, range: [70, 85] },
  { key: 'complete', label: '完成', icon: CheckCircle2, range: [85, 100] },
];

export function ParsingPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<ParseState>({
    stage: 'uploading',
    progress: 0,
    message: '正在连接服务器...',
  });
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState(false);

  useEffect(() => {
    if (!taskId) return;

    let retryCount = 0;
    const maxRetries = 3;

    const connect = () => {
      const ws = connectTaskWebSocket(taskId, (msg: WsMessage) => {
        retryCount = 0;

        switch (msg.event) {
          case 'upload_progress':
            setState({
              stage: 'uploading',
              progress: msg.progress || 0,
              message: msg.message || '文件上传中...',
            });
            break;
          case 'parse_progress':
            setState({
              stage: 'extracting',
              progress: msg.progress || 50,
              message: msg.message || '文档解析中...',
            });
            break;
          case 'quality_check':
            setState({
              stage: 'quality_check',
              progress: msg.progress || 75,
              message: msg.message || '质量检测中...',
              ocrScore: msg.data?.ocr_quality_score,
              ocrLevel: msg.data?.ocr_quality_level,
            });
            break;
          case 'parse_complete':
            setState({
              stage: 'complete',
              progress: 100,
              message: '解析完成，即将进入审核...',
            });
            // 解析完成后跳转 P03
            setTimeout(() => navigate(`/tasks/${taskId}/reviewing`), 1500);
            break;
          case 'parse_failed':
            setState({
              stage: 'failed',
              progress: 0,
              message: '解析失败',
              errorCode: msg.data?.error_code,
              errorMessage: msg.data?.error_message || '文档解析过程中出现错误',
            });
            break;
        }
      });

      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => {
        setWsConnected(false);
        if (retryCount < maxRetries && state.stage !== 'complete' && state.stage !== 'failed') {
          retryCount++;
          const delay = Math.pow(2, retryCount) * 1000;
          setTimeout(connect, delay);
        } else if (retryCount >= maxRetries) {
          setWsError(true);
        }
      };
      ws.onerror = () => ws.close();

      wsRef.current = ws;
    };

    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [taskId]);

  const currentStageIndex = STAGES.findIndex((s) => s.key === state.stage);

  return (
    <div className="max-w-xl mx-auto p-8">
      {/* 文档信息卡片 */}
      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <div className="text-[14px] text-muted-foreground">任务 ID</div>
        <div className="text-[15px] font-mono">{taskId}</div>
      </div>

      <h2 className="mb-6">文档解析进度</h2>

      {/* 连接状态指示 */}
      <div className="flex items-center gap-2 mb-4 text-[12px]">
        <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : wsError ? 'bg-red-500' : 'bg-yellow-500'}`} />
        <span className="text-muted-foreground">
          {wsConnected ? 'WebSocket 已连接' : wsError ? '连接失败（已重试3次）' : '正在连接...'}
        </span>
      </div>

      {/* ParseProgressPanel - 四阶段进度 */}
      {state.stage !== 'failed' && (
        <div className="space-y-4 mb-6">
          {STAGES.map((s, i) => {
            const StageIcon = s.icon;
            const isActive = s.key === state.stage;
            const isDone = i < currentStageIndex || state.stage === 'complete';
            const isPending = i > currentStageIndex && state.stage !== 'complete';

            return (
              <div key={s.key} className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    isDone ? 'bg-green-100 text-green-600' :
                    isActive ? 'bg-primary/10 text-primary' :
                    'bg-accent text-muted-foreground'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : isActive ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <StageIcon className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1">
                  <div className={`text-[14px] ${isActive ? 'text-foreground' : isPending ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {s.label}
                  </div>
                  {isActive && (
                    <div className="text-[12px] text-muted-foreground">{state.message}</div>
                  )}
                </div>
              </div>
            );
          })}

          {/* 全局进度条 */}
          <div className="mt-4">
            <div className="h-2 bg-accent rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${state.progress}%` }}
              />
            </div>
            <div className="text-[12px] text-muted-foreground mt-1 text-right">{state.progress}%</div>
          </div>
        </div>
      )}

      {/* OCR 质量警告区 */}
      {state.ocrScore !== undefined && state.ocrScore < 85 && state.stage !== 'failed' && (
        <div className={`p-4 rounded-lg mb-4 ${
          state.ocrScore < 70 ? 'bg-red-50 border border-red-200' : 'bg-orange-50 border border-orange-200'
        }`}>
          <div className="flex items-start gap-2">
            <AlertTriangle className={`w-4 h-4 mt-0.5 ${state.ocrScore < 70 ? 'text-red-500' : 'text-orange-500'}`} />
            <div>
              <div className="text-[14px]">
                {state.ocrScore < 70 ? '解析质量过低' : '解析质量中等'}
              </div>
              <div className="text-[13px] text-muted-foreground">
                OCR 质量分：{state.ocrScore.toFixed(1)}%
                {state.ocrScore < 70 && ' — 建议重新上传更清晰的文档'}
              </div>
              {/* 
                降级人工通道入口 — 【后端未开发】
                POST /api/v1/tasks/{task_id}/escalate-to-human 接口尚未实现
                暂时隐藏升级入口
              */}
            </div>
          </div>
        </div>
      )}

      {/* ��误状态区 */}
      {state.stage === 'failed' && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-6 text-center">
          <XCircle className="w-12 h-12 mx-auto text-destructive mb-3" />
          <h3 className="mb-2">解析失败</h3>
          <p className="text-[14px] text-muted-foreground mb-1">
            错误代码：{state.errorCode || '未知'}
          </p>
          <p className="text-[14px] text-muted-foreground mb-6">{state.errorMessage}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate('/upload')}
              className="px-5 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
            >
              重新上传
            </button>
            <button className="px-5 py-2 border border-border rounded-lg hover:bg-accent text-[14px]">
              联系支持
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
