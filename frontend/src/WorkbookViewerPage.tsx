import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, CircularProgress, LinearProgress, Tab, Tabs, ToggleButton, ToggleButtonGroup } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import { ApiError, errorMessage, workbookApi } from './api';
import { WorkbookGrid } from './WorkbookGrid';
import { cellAddress, type CellFinding, type SavedCellFinding, type WorkbookDetails, type WorksheetPreview } from './workbookModels';

function findingKey({ sheetNumber, row, column, start, original, suggestion }: CellFinding) {
  return JSON.stringify([sheetNumber, row, column, start, original, suggestion]);
}

function WorkbookViewer({ id }: { id: string }) {
  const [book, setBook] = useState<WorkbookDetails | null>(null);
  const [sheetNumber, setSheetNumber] = useState<number | null>(null);
  const [sheet, setSheet] = useState<WorksheetPreview | null>(null);
  const [saved, setSaved] = useState<SavedCellFinding[]>([]);
  const [results, setResults] = useState<CellFinding[]>([]);
  const [selected, setSelected] = useState<CellFinding | null>(null);
  const [scope, setScope] = useState<'sheet' | 'all'>('sheet');
  const [working, setWorking] = useState(false);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [notices, setNotices] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [sheetError, setSheetError] = useState('');
  const run = useRef<AbortController | null>(null);

  useEffect(() => {
    const request = new AbortController();
    Promise.all([workbookApi.details(id, request.signal), workbookApi.findings(id, request.signal)])
      .then(([details, findings]) => {
        if (request.signal.aborted) return;
        setBook(details);
        setSheetNumber(details.sheets[0]?.number ?? null);
        setSaved(findings);
      }).catch((failure) => { if (!request.signal.aborted) setError(errorMessage(failure)); });
    return () => { request.abort(); run.current?.abort(); };
  }, [id]);

  useEffect(() => {
    if (sheetNumber === null) return;
    const request = new AbortController();
    setSheetError('');
    workbookApi.sheet(id, sheetNumber, request.signal).then((preview) => {
      if (!request.signal.aborted) setSheet(preview);
    }).catch((failure) => { if (!request.signal.aborted) setSheetError(errorMessage(failure)); });
    return () => request.abort();
  }, [id, sheetNumber]);

  async function check() {
    if (!book || !sheetNumber || run.current) return;
    const request = new AbortController();
    run.current = request;
    const targets = book.sheets.filter((item) => scope === 'all' || item.number === sheetNumber);
    setResults([]);
    setSelected(null);
    setNotices([]);
    setError('');
    setWorking(true);
    let found = 0;
    let unsuccessful = 0;

    try {
      for (const [index, target] of targets.entries()) {
        let offset: number | null = 0;
        let skipped = 0;
        const name = `${index + 1} / ${targets.length} シート · ${target.name}`;
        setProgress(name);
        try {
          while (offset !== null) {
            const batch = await workbookApi.check(id, target.number, offset, request.signal);
            found += batch.candidates.length;
            skipped += batch.skipped;
            setResults((current) => [...current, ...batch.candidates]);
            setProgress(`${name} · ${batch.processed} / ${batch.total} セル処理済み`);
            offset = batch.nextOffset;
          }
        } catch (failure) {
          if (request.signal.aborted) return;
          if (failure instanceof ApiError && failure.status === 503) throw failure;
          unsuccessful++;
          setNotices((current) => [...current, `${target.name} · ${errorMessage(failure)}`]);
        }
        if (skipped) setNotices((current) => [...current, `${target.name} · 3,000文字を超えるセルを ${skipped} 件スキップしました。`]);
      }
      setProgress(unsuccessful
        ? `${targets.length} シート処理済み · 失敗 ${unsuccessful} シート · 候補 ${found} 件`
        : `${targets.length} シート完了 · 候補 ${found} 件`);
    } catch (failure) {
      if (!request.signal.aborted) {
        setError(errorMessage(failure));
        setProgress('');
      }
    } finally {
      run.current = null;
      if (!request.signal.aborted) setWorking(false);
    }
  }

  function locate(finding: CellFinding) {
    setSelected({ ...finding });
    setSheetNumber(finding.sheetNumber);
  }

  async function adopt(finding: CellFinding) {
    setError('');
    setAdopting(findingKey(finding));
    try {
      const result = await workbookApi.adopt(id, finding);
      setSaved((current) => current.some((entry) => entry.id === result.id) ? current : [...current, result]);
      locate(finding);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setAdopting(null);
    }
  }

  function renderFinding(finding: CellFinding, isSaved: boolean) {
    const key = findingKey(finding);
    const name = book?.sheets.find((item) => item.number === finding.sheetNumber)?.name;
    const alreadySaved = isSaved || saved.some((item) => findingKey(item.finding) === key);
    return <li key={key} className={selected && findingKey(selected) === key ? 'workbook-finding-selected' : ''}>
      <strong>{name}!{cellAddress(finding.row, finding.column)}</strong>
      <p><mark>{finding.original}</mark> → {finding.suggestion || '削除'}</p>
      {selected && findingKey(selected) === key && sheet?.info.number === finding.sheetNumber && finding.start !== null &&
        renderSource(sheet, finding, finding.start)}
      {finding.reason && <p>{finding.reason}</p>}
      <div className="proofreading-actions">
        <Button size="small" onClick={() => locate(finding)}>セルを表示</Button>
        {!isSaved && <Button size="small" variant="outlined"
          disabled={alreadySaved || finding.start === null || adopting !== null} onClick={() => void adopt(finding)}>
          {alreadySaved ? '採用済み' : adopting === key ? '保存中…' : '採用'}
        </Button>}
      </div>
      {finding.start === null && <small>セル内の文字範囲を特定できませんでした。</small>}
    </li>;
  }

  return <main className="viewer-page">
    <div className="viewer-heading">
      <Button component={Link} to="/workbooks" startIcon={<ArrowBackRounded />}>Excel一覧に戻る</Button>
      {book && <div className="viewer-title"><h1>{book.info.fileName}</h1></div>}
    </div>
    {!book && (error ? <Alert severity="error">{error}</Alert> : <div className="viewer-loading"><CircularProgress /></div>)}
    {book && <div className="viewer-workspace">
      <section className="preview">
        <Tabs value={sheetNumber ?? false} onChange={(_, next: number) => setSheetNumber(next)}
          variant="scrollable" scrollButtons="auto" aria-label="ワークシート" className="workbook-sheet-tabs">
          {book.sheets.map((item) => <Tab key={item.number} value={item.number} label={item.name} />)}
        </Tabs>
        {sheetError ? <Alert severity="error">{sheetError}</Alert> :
          sheet && sheet.info.number === sheetNumber ? <WorkbookGrid sheet={sheet} selected={selected} /> :
            <div className="viewer-loading"><CircularProgress size={24} /></div>}
      </section>
      <aside className="workbook-review" aria-label="Excelレビュー">
        <div className="panel-heading"><h2>誤字チェック</h2></div>
        <div className="proofreading-controls">
          <ToggleButtonGroup value={scope} exclusive size="small" disabled={working} aria-label="チェック範囲"
            onChange={(_, value: typeof scope | null) => { if (value) setScope(value); }}>
            <ToggleButton value="sheet">現在のシート</ToggleButton>
            <ToggleButton value="all">全シート</ToggleButton>
          </ToggleButtonGroup>
          <p className="proofreading-target">対象：{scope === 'all' ? `全${book.sheets.length}シート` :
            book.sheets.find((item) => item.number === sheetNumber)?.name}</p>
          <Button fullWidth variant="contained" disabled={working || sheetNumber === null} onClick={() => void check()}>
            {working ? 'チェック中…' : '誤字チェックを開始'}
          </Button>
        </div>
        {working && <LinearProgress />}
        {progress && <p role="status" className="workbook-review-message">{progress}</p>}
        {error && <Alert severity="error">{error}</Alert>}
        {notices.map((notice) => <Alert key={notice} severity="warning">{notice}</Alert>)}
        {results.length > 0 && <ul className="workbook-findings" aria-label="誤字候補">
          {results.map((item) => renderFinding(item, false))}
        </ul>}
        <div className="panel-heading"><h2>採用済みの指摘</h2><span>{saved.length} 件</span></div>
        <ul className="workbook-findings" aria-label="採用済みの指摘">
          {saved.map(({ finding }) => renderFinding(finding, true))}
        </ul>
      </aside>
    </div>}
  </main>;
}

function renderSource(sheet: WorksheetPreview, finding: CellFinding, offset: number) {
  const text = sheet.cells.find((cell) => cell.row === finding.row && cell.column === finding.column)?.text;
  if (text === undefined || text === null) return null;
  const end = offset + finding.original.length;
  return <p className="workbook-source">{text.slice(0, offset)}<mark>{text.slice(offset, end)}</mark>{text.slice(end)}</p>;
}

export default function WorkbookViewerPage() {
  const { id } = useParams();
  return id ? <WorkbookViewer key={id} id={id} /> : null;
}
