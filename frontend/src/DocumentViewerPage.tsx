import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, IconButton, TextField, ToggleButton, ToggleButtonGroup, Tooltip,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CropFreeRounded from '@mui/icons-material/CropFreeRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import FitScreenRounded from '@mui/icons-material/FitScreenRounded';
import FormatColorTextRounded from '@mui/icons-material/FormatColorTextRounded';
import LayersOutlined from '@mui/icons-material/LayersOutlined';
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import ZoomInRounded from '@mui/icons-material/ZoomInRounded';
import ZoomOutRounded from '@mui/icons-material/ZoomOutRounded';
import {
  PdfHighlighter, PdfLoader, useHighlightContainerContext,
  type Highlight, type PdfHighlighterUtils, type PdfScaleValue, type PdfSelection,
} from 'react-pdf-highlighter-extended';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api, errorMessage } from './api';
import { ConfirmDelete } from './ConfirmDelete';
import { fromScaled, toHighlight } from './coordinates';
import type { DocumentInfo, HighlightInfo, HighlightRegion } from './models';

interface OverlayHighlight extends Highlight {
  item?: HighlightInfo;
  selected?: boolean;
}

const minScale = 0.25;
const maxScale = 4;

function HighlightOverlay({ onSelect }: { onSelect: (id: string) => void }) {
  const { highlight } = useHighlightContainerContext<OverlayHighlight>();
  const { left, top, width, height } = highlight.position.boundingRect;
  const style = { left, top, width, height };
  if (!highlight.item) {
    return <span className="highlight-rectangle highlight-rectangle--draft" style={style} />;
  }
  return (
    <button
      type="button"
      className={`highlight-rectangle ${highlight.selected ? 'highlight-rectangle--selected' : ''}`}
      style={style}
      aria-label={`${highlight.item.pageNumber}ページのハイライト：${highlight.item.description || '説明なし'}`}
      aria-pressed={Boolean(highlight.selected)}
      onClick={() => onSelect(highlight.id)}
    />
  );
}

function canSelectArea(event: MouseEvent) {
  return event.button === 0 && event.target instanceof HTMLElement &&
    Boolean(event.target.closest('[data-area-mode="true"]'));
}

function DocumentViewer({ id }: { id: string }) {
  const [document, setDocument] = useState<DocumentInfo | null>(null);
  const [items, setItems] = useState<HighlightInfo[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [viewerReady, setViewerReady] = useState(false);
  const [mode, setMode] = useState<'text' | 'area'>('text');
  const [scale, setScale] = useState<PdfScaleValue>('page-width');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<HighlightRegion | null>(null);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<HighlightInfo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const highlighter = useRef<PdfHighlighterUtils | null>(null);
  const observedViewer = useRef<ReturnType<PdfHighlighterUtils['getViewer']>>(null);
  const listButtons = useRef(new Map<string, HTMLButtonElement>());

  const selected = items?.find((item) => item.id === selectedId);
  const highlights = useMemo(() => (items ?? []).map((item): OverlayHighlight => ({
    ...toHighlight(item.id, item),
    item,
    selected: item.id === selectedId,
  })), [items, selectedId]);
  const source = useMemo(() => ({
    url: api.contentUrl(id),
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    isEvalSupported: false,
  }), [id]);

  useEffect(() => {
    const request = new AbortController();
    Promise.all([api.documents(request.signal), api.highlights(id, request.signal)])
      .then(([documents, highlights]) => {
        const current = documents.find((item) => item.id === id);
        if (!current) throw new Error('PDFが見つかりません。');
        setDocument(current);
        setItems(highlights);
      }).catch((error: unknown) => {
        if (!request.signal.aborted) setLoadError(errorMessage(error));
      });
    return () => request.abort();
  }, [id]);

  function bindHighlighter(utils: PdfHighlighterUtils) {
    highlighter.current = utils;
    const viewer = utils.getViewer();
    if (!viewer || observedViewer.current === viewer) return;
    observedViewer.current = viewer;
    const ready = () => setViewerReady(true);
    // The library calls utilsRef while rendering, before PDF.js has always initialized its pages.
    if (viewer.getPageView(0)) queueMicrotask(ready);
    else viewer.eventBus.on('pagesinit', ready, { once: true });
  }

  function selectFromPdf(highlightId: string) {
    setSelectedId(highlightId);
    listButtons.current.get(highlightId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function selectFromList(item: HighlightInfo) {
    setSelectedId(item.id);
    const viewer = highlighter.current?.getViewer();
    const viewport = viewer?.getPageView(item.pageNumber - 1)?.viewport;
    if (!viewer || !viewport) return;
    const point = viewport.convertToPdfPoint(
      Math.max(0, item.rectangle.left * viewport.width - 20),
      Math.max(0, item.rectangle.top * viewport.height - 20),
    );
    viewer.scrollPageIntoView({ pageNumber: item.pageNumber, destArray: [null, { name: 'XYZ' }, ...point, null] });
  }

  function selectArea(selection: PdfSelection) {
    if (selection.type !== 'area') return;
    const region = fromScaled(selection.position.boundingRect);
    selection.makeGhostHighlight();
    if (!region) {
      highlighter.current?.removeGhostHighlight();
      return;
    }
    setDescription('');
    setSaveError('');
    setDraft(region);
  }

  function closeDraft() {
    highlighter.current?.removeGhostHighlight();
    setDraft(null);
  }

  async function saveHighlight() {
    if (!draft || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const item = await api.addHighlight(id, { ...draft, description });
      setItems((current) => [...(current ?? []), item]);
      setSelectedId(item.id);
      closeDraft();
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function deleteHighlight(item: HighlightInfo) {
    setDeleting(true);
    setDeleteError('');
    try {
      await api.deleteHighlight(item.id);
      setItems((current) => current?.filter(({ id }) => id !== item.id) ?? []);
      setSelectedId((current) => current === item.id ? null : current);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  function zoom(direction: 1 | -1) {
    const viewer = highlighter.current?.getViewer();
    if (!viewer) return;
    const current = viewer.currentScale;
    const index = direction > 0 ? Math.floor(current * 4 + 0.001) : Math.ceil(current * 4 - 0.001);
    setScale(Math.max(minScale, Math.min(maxScale, (index + direction) / 4)));
  }

  return (
    <main className="viewer-page">
      <div className="viewer-heading">
        <Button component={Link} to="/" startIcon={<ArrowBackRounded fontSize="small" />}>一覧に戻る</Button>
        {document && (
          <div className="viewer-title">
            <PictureAsPdfOutlined fontSize="small" />
            <h1 title={document.fileName}>{document.fileName}</h1>
            <span>{document.pageCount} ページ</span>
          </div>
        )}
      </div>
      {loadError && <Alert severity="error" sx={{ m: 2 }}>{loadError}</Alert>}
      {!document && !loadError && <div className="viewer-loading"><CircularProgress aria-label="PDFを読み込み中" /></div>}
      {document && (
        <div className="viewer-workspace">
          <section className="preview" aria-label="PDFプレビュー">
            <div className="viewer-toolbar">
              <ToggleButtonGroup
                value={mode} exclusive size="small" aria-label="選択モード"
                onChange={(_, value: typeof mode | null) => { if (value) setMode(value); }}
              >
                <ToggleButton value="text"><FormatColorTextRounded fontSize="small" />文字選択</ToggleButton>
                <ToggleButton value="area"><CropFreeRounded fontSize="small" />矩形選択</ToggleButton>
              </ToggleButtonGroup>
              <div className="zoom-controls" role="group" aria-label="表示倍率">
                <Tooltip title="縮小"><span>
                  <IconButton size="small" aria-label="縮小" disabled={!viewerReady || scale === minScale} onClick={() => zoom(-1)}>
                    <ZoomOutRounded fontSize="small" />
                  </IconButton>
                </span></Tooltip>
                <output aria-label="現在の倍率">{typeof scale === 'number' ? `${Math.round(scale * 100)}%` : 'ページ幅'}</output>
                <Tooltip title="拡大"><span>
                  <IconButton size="small" aria-label="拡大" disabled={!viewerReady || scale === maxScale} onClick={() => zoom(1)}>
                    <ZoomInRounded fontSize="small" />
                  </IconButton>
                </span></Tooltip>
                <Tooltip title="幅に合わせる">
                  <span>
                    <IconButton size="small" aria-label="幅に合わせる" disabled={!viewerReady} onClick={() => setScale('page-width')}>
                      <FitScreenRounded fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </div>
            </div>
            <div className="pdf-stage" data-area-mode={mode === 'area' && !draft}>
              <PdfLoader
                document={source}
                workerSrc={workerUrl}
                beforeLoad={() => <div className="viewer-loading"><CircularProgress aria-label="PDFを描画中" /></div>}
                onError={() => {}}
                errorMessage={(error) => <Alert severity="error" sx={{ m: 2 }}>PDFを表示できません。{error.message}</Alert>}
              >
                {(pdfDocument) => (
                  <PdfHighlighter
                    pdfDocument={pdfDocument}
                    pdfScaleValue={scale}
                    highlights={highlights}
                    utilsRef={bindHighlighter}
                    enableAreaSelection={canSelectArea}
                    onSelection={(selection) => selectArea(selection)}
                    mouseSelectionStyle={{ backgroundColor: 'rgba(99, 102, 241, 0.17)', border: '1px solid #4338ca' }}
                  >
                    <HighlightOverlay onSelect={selectFromPdf} />
                  </PdfHighlighter>
                )}
              </PdfLoader>
            </div>
          </section>
          <aside className="highlight-panel" aria-labelledby="highlight-heading">
            <div className="panel-heading">
              <LayersOutlined fontSize="small" />
              <h2 id="highlight-heading">ハイライト</h2>
              <span>{items?.length ?? 0} 件</span>
            </div>
            {selected && (
              <div className="selected-highlight" aria-live="polite">
                <span>{selected.pageNumber} ページのハイライト</span>
                <p>{selected.description || '説明なし'}</p>
              </div>
            )}
            <div className="highlight-list">
              {items?.length === 0 && (
                <div className="empty-highlights">
                  <span className="empty-icon"><CropFreeRounded /></span>
                  <strong>ハイライトはまだありません</strong>
                  <p>「矩形選択」に切り替え、PDF上でマウスをドラッグしてください。</p>
                </div>
              )}
              {items && items.length > 0 && (
                <ul aria-label="登録済みハイライト">
                  {items.map((item) => (
                    <li key={item.id} className={item.id === selectedId ? 'active-highlight' : ''}>
                      <button
                        type="button"
                        ref={(node) => {
                          if (node) listButtons.current.set(item.id, node);
                          else listButtons.current.delete(item.id);
                        }}
                        className="highlight-item"
                        disabled={!viewerReady}
                        aria-pressed={item.id === selectedId}
                        onClick={() => selectFromList(item)}
                      >
                        <span className="highlight-swatch" />
                        <span className="highlight-item-copy">
                          <span>{item.pageNumber} ページ</span>
                          <strong>{item.description || '説明なし'}</strong>
                        </span>
                      </button>
                      <Tooltip title="削除">
                        <IconButton size="small" aria-label={`ハイライトを削除：${item.description || '説明なし'}`} onClick={() => {
                          setDeleteError('');
                          setDeleteTarget(item);
                        }}>
                          <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
      {draft && (
        <Dialog open onClose={saving ? undefined : closeDraft} maxWidth="xs" fullWidth aria-labelledby="add-highlight-title">
          <form onSubmit={(event) => { event.preventDefault(); void saveHighlight(); }}>
            <DialogTitle id="add-highlight-title">ハイライトを登録</DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ mb: 2 }}>{draft.pageNumber} ページの選択範囲</DialogContentText>
              <TextField
                autoFocus fullWidth multiline minRows={3} maxRows={8}
                label="説明（任意）" value={description} disabled={saving}
                onChange={(event) => setDescription(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 2000 } }}
              />
              {saveError && <Alert severity="error" sx={{ mt: 2 }}>{saveError}</Alert>}
            </DialogContent>
            <DialogActions>
              <Button disabled={saving} onClick={closeDraft}>キャンセル</Button>
              <Button disabled={saving} variant="contained" type="submit">登録する</Button>
            </DialogActions>
          </form>
        </Dialog>
      )}
      {deleteTarget && <ConfirmDelete
        title="ハイライトを削除しますか？"
        message={`${deleteTarget.pageNumber} ページのハイライトを削除します。`}
        busy={deleting}
        error={deleteError}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteHighlight(deleteTarget)}
      />}
    </main>
  );
}

export default function DocumentViewerPage() {
  const { id } = useParams();
  return id ? <DocumentViewer key={id} id={id} /> : null;
}
