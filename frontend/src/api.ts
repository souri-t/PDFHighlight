import type { DocumentInfo, HighlightInfo, NewHighlight } from './models';

const documentsUrl = '/api/documents';
const documentUrl = (id: string) => `${documentsUrl}/${encodeURIComponent(id)}`;
const highlightsUrl = (id: string) => `${documentUrl(id)}/highlights`;

async function request(path: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(path, options);
  if (!response.ok) {
    const problem: { title?: string } | null = await response.json().catch(() => null);
    const message = response.status === 413
      ? 'ファイルサイズは50 MiB以下にしてください。'
      : problem?.title ?? `リクエストに失敗しました（HTTP ${response.status}）。`;
    throw new Error(message);
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
  deleteHighlight: (id: string) => request(`/api/highlights/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '処理に失敗しました。';
}
