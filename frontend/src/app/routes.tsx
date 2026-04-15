import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from './components/layouts/AppLayout';
import { TaskLayout } from './components/layouts/TaskLayout';
import { UploadPage } from './pages/UploadPage';
import { ParsingPage } from './pages/ParsingPage';
import { ReviewingPage } from './pages/ReviewingPage';
import { ResultPage } from './pages/ResultPage';
import { HumanReviewPage } from './pages/HumanReviewPage';
import { TaskListPage } from './pages/TaskListPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { FailedPage } from './pages/FailedPage';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppLayout,
    children: [
      { index: true, element: <Navigate to="/upload" replace /> },
      { path: 'upload', Component: UploadPage },
      { path: 'tasks', Component: TaskListPage },
      {
        path: 'tasks/:taskId',
        Component: TaskLayout,
        children: [
          { index: true, Component: TaskDetailPage },
          { path: 'parsing', Component: ParsingPage },
          { path: 'reviewing', Component: ReviewingPage },
          { path: 'result', Component: ResultPage },
          { path: 'human-review', Component: HumanReviewPage },
          { path: 'failed', Component: FailedPage },
        ],
      },
    ],
  },
]);
