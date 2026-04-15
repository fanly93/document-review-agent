/**
 * P01 — 文档上传页 /upload
 * 数据依赖：
 *   POST /api/v1/upload/init → chunk_upload_id + presigned URL
 *   PUT <presigned_url> → 上传分片（Mock 模式下模拟）
 *   POST /api/v1/upload/complete → 合并分片，返回 task_id
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Upload, FileText, File, X, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { uploadInit, uploadChunk, uploadComplete } from '../api/client';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc'];
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_FILES_PER_BATCH = 10;

interface FileItem {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  taskId?: string;
}

export function UploadPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `格式不支持：仅允许 ${ALLOWED_EXTENSIONS.join('、')}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `文件超过 50MB 限制（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB）`;
    }
    return null;
  };

  const addFiles = useCallback((newFiles: File[]) => {
    const remaining = MAX_FILES_PER_BATCH - files.length;
    if (remaining <= 0) {
      toast.error(`每次最多上传 ${MAX_FILES_PER_BATCH} 个文件`);
      return;
    }
    const toAdd = newFiles.slice(0, remaining);
    const items: FileItem[] = toAdd.map((f) => {
      const error = validateFile(f);
      return {
        file: f,
        id: crypto.randomUUID(),
        status: error ? 'error' : 'pending',
        progress: 0,
        error: error || undefined,
      };
    });
    setFiles((prev) => [...prev, ...items]);
  }, [files.length]);

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const clearAll = () => setFiles([]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const validFiles = files.filter((f) => f.status !== 'error');
  const canSubmit = validFiles.length > 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);

    for (const item of validFiles) {
      try {
        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: 'uploading' as const, progress: 5 } : f))
        );

        const totalParts = item.file.size >= 20 * 1024 * 1024
          ? Math.ceil(item.file.size / CHUNK_SIZE)
          : 1;

        const contentType = item.file.type || 'application/pdf';

        // Step 1: Init
        const initRes = await uploadInit({
          original_filename: item.file.name,
          file_size_bytes: item.file.size,
          total_parts: totalParts,
          content_type: contentType,
        });

        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, progress: 15 } : f))
        );

        // Step 2: Upload chunks
        const parts: { part_number: number; etag: string }[] = [];
        for (const part of initRes.upload_parts) {
          const start = (part.part_number - 1) * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, item.file.size);
          const chunk = item.file.slice(start, end);

          const etag = await uploadChunk(part.presigned_url, chunk);
          parts.push({ part_number: part.part_number, etag });

          const progressPerPart = 25 / totalParts;
          setFiles((prev) =>
            prev.map((f) =>
              f.id === item.id
                ? { ...f, progress: Math.min(Math.round(15 + progressPerPart * part.part_number), 40) }
                : f
            )
          );
        }

        // Step 3: Complete
        const completeRes = await uploadComplete({
          chunk_upload_id: initRes.chunk_upload_id,
          parts,
        });

        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: 'success' as const, progress: 100, taskId: completeRes.task_id }
              : f
          )
        );

        toast.success(`${item.file.name} 上传成功，即将跳转...`);

        setTimeout(() => {
          navigate(`/tasks/${completeRes.task_id}/parsing`);
        }, 800);
        return;
      } catch (err: any) {
        const errorMsg = err?.message || '上传失败';
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id ? { ...f, status: 'error' as const, error: errorMsg } : f
          )
        );
        toast.error(`${item.file.name}: ${errorMsg}`);
      }
    }
    setIsSubmitting(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const getFileIcon = (name: string) => {
    if (name.endsWith('.pdf')) return <FileText className="w-5 h-5 text-red-500" />;
    return <File className="w-5 h-5 text-blue-500" />;
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="mb-1">文档上传</h1>
      <p className="text-[14px] text-muted-foreground mb-6">
        上传合同文档进行 AI 辅助审核，支持 PDF / .docx / .doc 格式，单文件不超过 50MB
      </p>

      {/* UploadZone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
          isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        }`}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-[15px] mb-1">将文件拖拽至此处，或点击选择文件</p>
        <p className="text-[13px] text-muted-foreground">
          支持格式：PDF、Word（.docx/.doc）| 单文件 ≤ 50MB | 每次最多 {MAX_FILES_PER_BATCH} 个
        </p>
        <p className="text-[11px] text-muted-foreground mt-2">
          ≥ 20MB 文件将自动启用分片上传（5MB/片，并发 ≤3）
        </p>
        <input
          id="file-input"
          type="file"
          multiple
          accept=".pdf,.docx,.doc"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* FilePreviewList */}
      {files.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[14px] text-muted-foreground">
              已选择 {files.length} 个文件
              {validFiles.length < files.length && (
                <span className="text-destructive ml-1">（{files.length - validFiles.length} 个不合格）</span>
              )}
            </span>
            <button
              onClick={clearAll}
              className="text-[13px] text-destructive hover:underline flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> 清空列表
            </button>
          </div>
          {files.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                item.status === 'error' ? 'border-destructive/30 bg-destructive/5' :
                item.status === 'success' ? 'border-green-300 bg-green-50' :
                'border-border bg-card'
              }`}
            >
              {getFileIcon(item.file.name)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] truncate">{item.file.name}</span>
                  <span className="text-[12px] text-muted-foreground shrink-0">
                    {formatSize(item.file.size)}
                  </span>
                  {item.file.size >= 20 * 1024 * 1024 && item.status === 'pending' && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">分片上传</span>
                  )}
                </div>
                {item.status === 'error' && (
                  <div className="flex items-center gap-1 text-[12px] text-destructive mt-0.5">
                    <AlertCircle className="w-3 h-3" />
                    {item.error}
                  </div>
                )}
                {item.status === 'uploading' && (
                  <div className="mt-1.5">
                    <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground">上传中... {item.progress}%</span>
                  </div>
                )}
                {item.status === 'success' && (
                  <div className="flex items-center gap-1 text-[12px] text-green-600 mt-0.5">
                    <CheckCircle className="w-3 h-3" /> 上传成功
                    {item.taskId && <span className="text-muted-foreground ml-1">任务: {item.taskId.slice(0, 12)}...</span>}
                  </div>
                )}
              </div>
              {item.status !== 'uploading' && item.status !== 'success' && (
                <button onClick={() => removeFile(item.id)} className="p-1 rounded hover:bg-accent">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 操作区 */}
      {files.length > 0 && (
        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {isSubmitting ? '上传中...' : `提交上传（${validFiles.length} 个文件）`}
          </button>
          <button
            onClick={clearAll}
            disabled={isSubmitting}
            className="px-4 py-2.5 border border-border rounded-lg hover:bg-accent disabled:opacity-50 text-[14px]"
          >
            清空
          </button>
        </div>
      )}

      {/* 空状态提示 */}
      {files.length === 0 && (
        <div className="mt-8 p-4 bg-accent/30 rounded-lg text-[13px] text-muted-foreground">
          <p className="mb-1">📋 <strong>前端校验规则：</strong></p>
          <ul className="list-disc list-inside space-y-0.5 ml-2">
            <li>格式：仅支持 .pdf / .docx / .doc</li>
            <li>大小：单文件 ≤ 50MB</li>
            <li>数量：每次最多 10 个文件</li>
            <li>分片策略：≥ 20MB 自动分片（5MB/片）</li>
          </ul>
          <p className="mt-2 text-[11px]">注：以上为客户端快速拦截，后端仍须二次校验（含融资股权文件类型检测）</p>
        </div>
      )}
    </div>
  );
}
