import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert, Button, CircularProgress, IconButton, LinearProgress, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tooltip,
} from '@mui/material';
import ArrowOutwardRounded from '@mui/icons-material/ArrowOutwardRounded';
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import { api, errorMessage } from './api';
import { ConfirmDelete } from './ConfirmDelete';
import type { DocumentInfo } from './models';

const dateFormat = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });

export function DocumentListPage() {
  const [documents, setDocuments] = useState<DocumentInfo[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [target, setTarget] = useState<DocumentInfo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    const request = new AbortController();
    api.documents(request.signal).then(setDocuments).catch((error: unknown) => {
      if (!request.signal.aborted) setLoadError(errorMessage(error));
    });
    return () => request.abort();
  }, []);

  async function upload(file: File) {
    if (uploading) return;
    setUploadError('');
    if (!/\.pdf$/i.test(file.name) || file.size === 0 || file.size > 50 * 1024 * 1024) {
      setUploadError('50 MiB以下のPDFファイルを選択してください。');
      return;
    }
    setUploading(true);
    try {
      const document = await api.upload(file);
      setDocuments((current) => [document, ...(current ?? [])]);
    } catch (error) {
      setUploadError(errorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(document: DocumentInfo) {
    setDeleting(true);
    setDeleteError('');
    try {
      await api.deleteDocument(document.id);
      setDocuments((current) => current?.filter(({ id }) => id !== document.id) ?? []);
      setTarget(null);
    } catch (error) {
      setDeleteError(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="library">
      <div className="library-heading">
        <h1>ドキュメント</h1>
        <p>PDFを開いて、確認したい箇所にマークを付けられます。</p>
      </div>

      <section
        className={`upload-zone ${dragging ? 'upload-zone--active' : ''}`}
        aria-label="PDFアップロード"
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (!documents) return;
          const { files } = event.dataTransfer;
          if (files.length > 1) {
            setUploadError('PDFは1ファイルずつアップロードしてください。');
          } else if (files[0]) {
            void upload(files[0]);
          }
        }}
      >
        <div className="upload-copy">
          <span className="upload-icon"><CloudUploadOutlined /></span>
          <div>
            <h2>PDFをアップロード</h2>
            <p>ドラッグ＆ドロップまたはファイルを選択 · 最大50 MiB</p>
          </div>
        </div>
        <input
          ref={input}
          type="file"
          aria-label="PDFファイル"
          accept="application/pdf,.pdf"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void upload(file);
          }}
        />
        <Button
          variant="contained"
          onClick={() => input.current?.click()}
          disabled={!documents || uploading}
          sx={{ whiteSpace: 'nowrap', px: 2.4, py: 1.05 }}
        >
          {uploading ? 'アップロード中…' : 'ファイルを選択'}
        </Button>
        {uploading && <LinearProgress className="upload-progress" aria-label="アップロード中" />}
      </section>
      {uploadError && <Alert severity="error" sx={{ mt: 2 }}>{uploadError}</Alert>}

      <section className="document-section" aria-labelledby="documents-heading">
        <div className="section-heading">
          <h2 id="documents-heading">保存済みPDF</h2>
          {documents && <span>{documents.length} 件</span>}
        </div>
        {loadError && <Alert severity="error">{loadError}</Alert>}
        {!documents && !loadError && <CircularProgress size={24} aria-label="PDF一覧を読み込み中" />}
        {documents && (
          <TableContainer className="document-table">
            <Table aria-label="保存済みPDF">
              <TableHead>
                <TableRow>
                  <TableCell>ファイル名</TableCell>
                  <TableCell className="table-secondary">ページ</TableCell>
                  <TableCell className="table-secondary">登録日時</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell>
                      <Link className="file-link" to={`/documents/${document.id}`}>
                        <span className="file-icon"><PictureAsPdfOutlined fontSize="small" /></span>
                        <span>{document.fileName}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="table-secondary">{document.pageCount}</TableCell>
                    <TableCell className="table-secondary">{dateFormat.format(new Date(document.createdAt))}</TableCell>
                    <TableCell align="right">
                      <div className="row-actions">
                        <Tooltip title="開く">
                          <IconButton component={Link} to={`/documents/${document.id}`} aria-label={`${document.fileName}を開く`}>
                            <ArrowOutwardRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="削除">
                          <IconButton aria-label={`${document.fileName}を削除`} onClick={() => {
                            setDeleteError('');
                            setTarget(document);
                          }}>
                            <DeleteOutlineRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {documents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <div className="empty-documents">
                        <span className="empty-icon"><FolderOpenRounded /></span>
                        <strong>PDFがまだありません</strong>
                        <p>アップロードしたPDFがここに表示されます。</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </section>
      {target && <ConfirmDelete
        title="PDFを削除しますか？"
        message={`「${target.fileName}」と、このPDFに登録したハイライトを削除します。`}
        busy={deleting}
        error={deleteError}
        onCancel={() => setTarget(null)}
        onConfirm={() => void deleteDocument(target)}
      />}
    </main>
  );
}
