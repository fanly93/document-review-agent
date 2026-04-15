import { Outlet, Link, useParams } from 'react-router';
import { ChevronRight } from 'lucide-react';

export function TaskLayout() {
  const { taskId } = useParams();

  return (
    <div className="flex flex-col h-full">
      {/* 面包屑 */}
      <div className="px-6 py-2 border-b border-border bg-card/50 flex items-center gap-1 text-[13px] text-muted-foreground">
        <Link to="/tasks" className="hover:text-foreground transition-colors">任务列表</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">{taskId?.slice(0, 8) || '任务详情'}</span>
      </div>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
