export interface DocumentInfo {
  id: string;
  fileName: string;
  pageCount: number;
  createdAt: string;
}

export interface PageRectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface HighlightRegion {
  pageNumber: number;
  rectangle: PageRectangle;
}

export interface NewHighlight extends HighlightRegion {
  id?: string;
  description: string;
}

export interface HighlightInfo extends NewHighlight {
  id: string;
  documentId: string;
  createdAt: string;
}

export type ProofreadingScope = { scope: 'all' } | { scope: 'page'; pageNumber: number };

export interface ProofreadingCandidate {
  id: string;
  pageNumber: number;
  original: string;
  suggestion: string;
  reason: string;
  rectangle: PageRectangle | null;
}

export interface ProofreadingPage {
  pageNumber: number;
  status: 'completed' | 'skipped' | 'failed';
  candidates: ProofreadingCandidate[];
  message: string | null;
}

export interface ProofreadingCheck {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  firstPage: number;
  lastPage: number;
  totalPages: number;
  processedPages: number;
  currentPage: number | null;
  pages: ProofreadingPage[];
  message: string | null;
}
