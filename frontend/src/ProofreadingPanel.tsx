import { useEffect, useRef, useState } from 'react';
import { Alert, Button, LinearProgress, ToggleButton, ToggleButtonGroup } from '@mui/material';
import SpellcheckRounded from '@mui/icons-material/SpellcheckRounded';
import type { PdfHighlighterUtils } from 'react-pdf-highlighter-extended';
import { api, ApiError, errorMessage } from './api';
import type { HighlightInfo, ProofreadingCandidate, ProofreadingCheck, ProofreadingScope } from './models';

interface Props {
  documentId: string;
  pageCount: number;
  viewer: ReturnType<PdfHighlighterUtils['getViewer']>;
  highlights: HighlightInfo[];
  selectedId: string | undefined;
  onPreview: (candidate: ProofreadingCandidate | null) => void;
  onAdopt: (candidate: ProofreadingCandidate) => Promise<void>;
}

function isActive(check: ProofreadingCheck | null) {
  return check?.status === 'queued' || check?.status === 'running';
}

export function ProofreadingPanel({
  documentId, pageCount, viewer, highlights, selectedId, onPreview, onAdopt,
}: Props) {
  const [currentPage, setCurrentPage] = useState(1);
  const [scope, setScope] = useState<ProofreadingScope['scope']>('page');
  const [check, setCheck] = useState<ProofreadingCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [startError, setStartError] = useState('');
  const [pollError, setPollError] = useState('');
  const [adoptError, setAdoptError] = useState('');
  const startRequest = useRef<AbortController | null>(null);
  const activeId = isActive(check) ? check?.id : undefined;
  const busy = Boolean(activeId) || starting;

  useEffect(() => {
    if (!viewer) return;
    const update = () => setCurrentPage(viewer.currentPageNumber);
    update();
    viewer.eventBus.on('pagechanging', update);
    return () => viewer.eventBus.off('pagechanging', update);
  }, [viewer]);

  useEffect(() => {
    const request = new AbortController();
    api.latestProofreading(documentId, request.signal).then((result) => {
      if (!request.signal.aborted) setCheck(result);
    }).catch((error: unknown) => {
      if (!request.signal.aborted) setStartError(errorMessage(error));
    }).finally(() => {
      if (!request.signal.aborted) setLoading(false);
    });
    return () => {
      request.abort();
      startRequest.current?.abort();
    };
  }, [documentId]);

  useEffect(() => {
    if (!activeId) return;
    const request = new AbortController();
    const checkId = activeId;
    let timer: ReturnType<typeof setTimeout>;
    async function update() {
      try {
        const result = await api.proofreading(documentId, checkId, request.signal);
        if (request.signal.aborted) return;
        setCheck(result);
        setPollError('');
        if (isActive(result)) timer = setTimeout(update, 600);
      } catch (error) {
        if (request.signal.aborted) return;
        if (error instanceof ApiError && error.status === 404) {
          setCheck(null);
          setPollError('チェックの結果が見つかりません。もう一度開始してください。');
        } else {
          setPollError('進捗を取得できませんでした。再接続しています。');
          timer = setTimeout(update, 1800);
        }
      }
    }

    timer = setTimeout(update, 250);
    return () => {
      clearTimeout(timer);
      request.abort();
    };
  }, [documentId, activeId]);

  async function start() {
    if (busy || startRequest.current) return;
    const request = new AbortController();
    startRequest.current = request;
    setStarting(true);
    setStartError('');
    setPollError('');
    setAdoptError('');
    const target = scope === 'page' ? { scope, pageNumber: viewer?.currentPageNumber ?? currentPage } : { scope };

    try {
      const result = await api.startProofreading(documentId, target, request.signal).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 409)
          return api.latestProofreading(documentId, request.signal);
        throw error;
      });
      if (request.signal.aborted) return;
      if (!result) throw new Error('実行中のチェックを取得できませんでした。');
      onPreview(null);
      setCheck(result);
    } catch (error) {
      if (!request.signal.aborted) setStartError(errorMessage(error));
    } finally {
      startRequest.current = null;
      if (!request.signal.aborted) setStarting(false);
    }
  }

  async function adopt(candidate: ProofreadingCandidate) {
    if (adopting) return;
    setAdopting(candidate.id);
    setAdoptError('');
    try {
      await onAdopt(candidate);
    } catch (error) {
      setAdoptError(errorMessage(error));
    } finally {
      setAdopting(null);
    }
  }

  const errors = [startError, pollError, adoptError, check?.message].filter(Boolean);
  const pages = check?.pages ?? [];
  const candidates = pages.flatMap((page) => page.candidates);
  const incomplete = pages.filter((page) => page.status !== 'completed');
  const completed = check?.status === 'completed';
  const targetLabel = scope === 'all' ? `全${pageCount}ページ` : `${currentPage}ページ`;
  const runTarget = check && (check.firstPage === check.lastPage ? `${check.firstPage}ページ` : `全${check.totalPages}ページ`);

  return (
    <section className="proofreading-panel" aria-labelledby="proofreading-heading">
      <div className="panel-heading">
        <SpellcheckRounded fontSize="small" />
        <h2 id="proofreading-heading">誤字チェック</h2>
        {check && <span>候補 {candidates.length} 件</span>}
      </div>
      <div className="proofreading-controls">
        <ToggleButtonGroup
          value={scope} exclusive size="small" aria-label="誤字チェックの対象" disabled={busy}
          onChange={(_, value: typeof scope | null) => { if (value) setScope(value); }}
        >
          <ToggleButton value="page">現在のページ</ToggleButton>
          <ToggleButton value="all">全ページ</ToggleButton>
        </ToggleButtonGroup>
        <p className="proofreading-target">対象：{targetLabel}</p>
        <Button variant="contained" fullWidth onClick={() => void start()}
          disabled={!viewer || loading || busy || Boolean(adopting)}>
          {busy ? 'チェック中…' : '誤字チェックを開始'}
        </Button>
      </div>
      {check && (busy || completed) && (
        <div className="proofreading-progress" role="status">
          <span>{check.status === 'queued' ? '順番待ち' : completed ? 'チェック終了' :
            check.currentPage ? `${check.currentPage}ページをチェック中…` : 'チェック中…'}</span>
          <span>{runTarget} · {check.processedPages} / {check.totalPages}ページ処理済み</span>
          {busy && <LinearProgress aria-label="誤字チェックの進捗" variant="determinate"
            value={100 * check.processedPages / check.totalPages} />}
        </div>
      )}
      {(errors.length > 0 || candidates.length > 0 || incomplete.length > 0 || completed) && (
        <div className="proofreading-results">
          {errors.map((error, index) => <Alert key={index} severity="error">{error}</Alert>)}
          {incomplete.map((page) => (
            <Alert key={page.pageNumber} severity={page.status === 'skipped' ? 'info' : 'warning'}>
              {page.pageNumber}ページ · {page.message}
            </Alert>
          ))}
          {completed && candidates.length === 0 && incomplete.length < pages.length && (
            <p className="proofreading-empty">チェックできたページに誤字候補はありません。</p>
          )}
          {candidates.length > 0 && (
            <ul aria-label="誤字候補">
              {candidates.map((candidate) => {
                const saved = highlights.some(({ id }) => id === candidate.id);
                const positioned = candidate.rectangle !== null;
                return (
                  <li key={candidate.id} className={candidate.id === selectedId ? 'proofreading-candidate--selected' : ''}>
                    <span className="proofreading-page">{candidate.pageNumber}ページ</span>
                    <p className="proofreading-change"><strong>{candidate.original}</strong> → {candidate.suggestion || '削除'}</p>
                    {candidate.reason && <p className="proofreading-reason">{candidate.reason}</p>}
                    {positioned ? (
                      <div className="proofreading-actions">
                        <Button size="small" disabled={!viewer} onClick={() => onPreview(candidate)}>位置を表示</Button>
                        <Button size="small" variant="outlined" disabled={saved || Boolean(adopting)}
                          onClick={() => void adopt(candidate)}>
                          {saved ? '採用済み' : adopting === candidate.id ? '保存中…' : '採用'}
                        </Button>
                      </div>
                    ) : <span className="proofreading-page">位置を特定できませんでした</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
