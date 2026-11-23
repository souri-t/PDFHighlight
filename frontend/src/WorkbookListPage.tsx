import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, CircularProgress, IconButton } from '@mui/material';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { errorMessage, workbookApi } from './api';
import { ConfirmDelete } from './ConfirmDelete';
import type { WorkbookInfo } from './workbookModels';

export default function WorkbookListPage() {
  const [books, setBooks] = useState<WorkbookInfo[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<WorkbookInfo | null>(null);

  useEffect(() => {
    const request = new AbortController();
    workbookApi.list(request.signal).then(setBooks).catch((failure) => {
      if (!request.signal.aborted) setError(errorMessage(failure));
    });
    return () => request.abort();
  }, []);

  async function upload(file: File) {
    setError('');
    setBusy(true);
    try {
      const book = await workbookApi.upload(file);
      setBooks((current) => [book, ...(current ?? [])]);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function remove(book: WorkbookInfo) {
    setBusy(true);
    setError('');
    try {
      await workbookApi.delete(book.id);
      setBooks((current) => current?.filter((item) => item.id !== book.id) ?? []);
      setTarget(null);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="library">
      <div className="library-heading"><h1>Excelブック</h1><p>シートをプレビューして誤字を確認できます。</p></div>
      <section className="upload-zone">
        <div><strong>Excelをアップロード</strong><p>.xlsx · 最大10 MiB</p></div>
        <Button component="label" variant="contained" disabled={busy || !books}>
          {busy && !target ? 'アップロード中…' : 'ファイルを選択'}
          <input type="file" accept=".xlsx" aria-label="Excelファイル" hidden onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void upload(file);
          }} />
        </Button>
      </section>
      {error && !target && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      <section className="document-section">
        <div className="section-heading"><h2>保存済みExcel</h2>{books && <span>{books.length} 件</span>}</div>
        {!books && !error && <CircularProgress size={24} />}
        {books && <ul className="workbook-list" aria-label="保存済みExcel">
          {books.length === 0 && <li>Excelファイルはまだありません。</li>}
          {books.map((book) => <li key={book.id}>
            <Link className="file-link" to={`/workbooks/${book.id}`}>{book.fileName}</Link>
            <IconButton aria-label={`${book.fileName}を削除`} disabled={busy} onClick={() => {
              setError('');
              setTarget(book);
            }}><DeleteOutlineRounded fontSize="small" /></IconButton>
          </li>)}
        </ul>}
      </section>
      {target && <ConfirmDelete title="Excelを削除しますか？" message={`「${target.fileName}」と採用済みの指摘を削除します。`}
        busy={busy} error={error} onCancel={() => setTarget(null)} onConfirm={() => void remove(target)} />}
    </main>
  );
}
