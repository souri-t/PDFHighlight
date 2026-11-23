import type { DocumentInfo, HighlightInfo, NewHighlight, ProofreadingCheck, ProofreadingScope } from './models';
import type { CellFinding, SavedCellFinding, WorkbookDetails, WorkbookInfo, WorksheetCheck, WorksheetPreview } from "./workbookModels";

const documentsUrl = '/api/documents';
const documentUrl = (id: string) => `${documentsUrl}/${encodeURIComponent(id)}`;
const highlightsUrl = (id: string) => `${documentUrl(id)}/highlights`;
const proofreadingUrl = (id: string) => `${documentUrl(id)}/proofreading`;

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request(path: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(path, options);
  if (!response.ok) {
    const problem: { title?: string } | null = await response.json().catch(() => null);
    const message = response.status === 413
      ? 'ファイルサイズは50 MiB以下にしてください。'
      : problem?.title ?? `リクエストに失敗しました（HTTP ${response.status}）。`;
    throw new ApiError(message, response.status);
  }
  return response;
}

async function json<T>(path: string, options?: RequestInit): Promise<T> {
  return (await request(path, options)).json() as Promise<T>;
}

export const api = {
  documents: (signal: AbortSignal) => json<DocumentInfo[]>(documentsUrl, { signal }),
  contentUrl: (id: string) => `${documentUrl(id)}/content`,
  upload(file: File) {
    const body = new FormData();
    body.set('file', file);
    return json<DocumentInfo>(documentsUrl, { method: 'POST', body });
  },
  deleteDocument: (id: string) => request(documentUrl(id), { method: 'DELETE' }),
  highlights: (id: string, signal: AbortSignal) => json<HighlightInfo[]>(highlightsUrl(id), { signal }),
  addHighlight: (id: string, item: NewHighlight) => json<HighlightInfo>(highlightsUrl(id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  }),
  startProofreading: (id: string, scope: ProofreadingScope, signal: AbortSignal) =>
    json<ProofreadingCheck>(proofreadingUrl(id), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scope),
      signal,
    }),
  async latestProofreading(id: string, signal: AbortSignal): Promise<ProofreadingCheck | null> {
    const response = await request(proofreadingUrl(id), { signal });
    return response.status === 204 ? null : response.json() as Promise<ProofreadingCheck>;
  },
  proofreading: (id: string, checkId: string, signal: AbortSignal) =>
    json<ProofreadingCheck>(`${proofreadingUrl(id)}/${encodeURIComponent(checkId)}`, { signal }),
  deleteHighlight: (id: string) => request(`/api/highlights/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '処理に失敗しました。';
}

const workbooksUrl = '/api/workbooks';
const workbookUrl = (id: string) => `${workbooksUrl}/${encodeURIComponent(id)}`;
const sheetUrl = (id: string, number: number) => `${workbookUrl(id)}/sheets/${number}`;

export const workbookApi = {
  list: (signal: AbortSignal) => json<WorkbookInfo[]>(workbooksUrl, { signal }),
  upload(file: File) {
    const body = new FormData();
    body.set('file', file);
    return json<WorkbookInfo>(workbooksUrl, { method: 'POST', body });
  },
  delete: (id: string) => request(workbookUrl(id), { method: 'DELETE' }),
  details: (id: string, signal: AbortSignal) => json<WorkbookDetails>(workbookUrl(id), { signal }),
  sheet: (id: string, number: number, signal: AbortSignal) => json<WorksheetPreview>(sheetUrl(id, number), { signal }),
  findings: (id: string, signal: AbortSignal) =>
    json<SavedCellFinding[]>(`${workbookUrl(id)}/findings`, { signal }),
  check: (id: string, number: number, offset: number, signal: AbortSignal) =>
    json<WorksheetCheck>(`${sheetUrl(id, number)}/proofreading`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offset }), signal,
    }),
  adopt: (id: string, finding: CellFinding) => json<SavedCellFinding>(`${workbookUrl(id)}/findings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(finding),
  }),
};
