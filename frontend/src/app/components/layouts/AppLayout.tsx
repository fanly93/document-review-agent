import { Outlet, Link, useLocation } from 'react-router';
import { FileText, LogOut, User, Upload, List } from 'lucide-react';

export function AppLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* 顶部导航栏 */}
      <header className="h-14 border-b border-border bg-card flex items-center px-6 shrink-0">
        <Link to="/tasks" className="flex items-center gap-2 text-primary">
          <FileText className="w-5 h-5" />
          <span className="text-[17px]">智能合同审核系统</span>
        </Link>
        <nav className="ml-8 flex gap-1">
          <Link
            to="/upload"
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 text-[14px] transition-colors ${
              location.pathname === '/upload' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            <Upload className="w-4 h-4" />
            文档上传
          </Link>
          <Link
            to="/tasks"
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 text-[14px] transition-colors ${
              location.pathname === '/tasks' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            <List className="w-4 h-4" />
            任务列表
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <User className="w-4 h-4" />
            <span>法务专员</span>
            <span className="text-[12px] bg-accent px-1.5 py-0.5 rounded">legal_staff</span>
          </div>
          <button className="p-1.5 rounded hover:bg-accent text-muted-foreground">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>
      {/* 主体 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}