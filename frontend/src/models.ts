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
  description: string;
}

export interface HighlightInfo extends NewHighlight {
  id: string;
  documentId: string;
  createdAt: string;
}
