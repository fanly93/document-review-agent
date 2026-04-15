/**
 * RiskScorePanel - 整体风险评分仪表盘（0-100，5色阶）
 * 数据只读，颜色由 risk_level_summary 决定
 */

interface Props {
  score: number;
  level: string;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  generatedAt?: string;
}

const LEVEL_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: 'text-red-700', bg: 'bg-red-500', label: '严重' },
  high: { color: 'text-orange-700', bg: 'bg-orange-500', label: '高' },
  medium: { color: 'text-yellow-700', bg: 'bg-yellow-500', label: '中' },
  low: { color: 'text-green-700', bg: 'bg-green-500', label: '低' },
  info: { color: 'text-gray-600', bg: 'bg-gray-400', label: '信息' },
};

export function RiskScorePanel({ score, level, criticalCount, highCount, mediumCount, lowCount }: Props) {
  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG.medium;

  // 5色阶：0-20绿，20-40蓝，40-60黄，60-80橙，80-100红
  const getScoreColor = (s: number) => {
    if (s >= 80) return '#ef4444';
    if (s >= 60) return '#f97316';
    if (s >= 40) return '#eab308';
    if (s >= 20) return '#3b82f6';
    return '#22c55e';
  };

  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center gap-6">
        {/* 仪表盘 */}
        <div className="relative w-32 h-32 shrink-0">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            <circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" strokeWidth="8" />
            <circle
              cx="60" cy="60" r="54" fill="none"
              stroke={getScoreColor(score)}
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[28px]" style={{ color: getScoreColor(score) }}>
              {score.toFixed(0)}
            </span>
            <span className="text-[11px] text-muted-foreground">风险评分</span>
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2 py-0.5 rounded text-[12px] text-white ${cfg.bg}`}>
              {cfg.label}风险
            </span>
          </div>

          {/* 分类计数 */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Critical', count: criticalCount, color: 'bg-red-500' },
              { label: 'High', count: highCount, color: 'bg-orange-500' },
              { label: 'Medium', count: mediumCount, color: 'bg-yellow-500' },
              { label: 'Low', count: lowCount, color: 'bg-green-500' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-[13px]">
                <div className={`w-2.5 h-2.5 rounded-sm ${item.color}`} />
                <span className="text-muted-foreground">{item.label}</span>
                <span className="ml-auto">{item.count}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 text-[11px] text-muted-foreground">
            本报告为 AI 辅助初审结果，不构成法律建议
          </div>
        </div>
      </div>
    </div>
  );
}
