export interface WorkbookInfo {
  id: string;
  fileName: string;
  createdAt: string;
}

export interface WorksheetInfo {
  number: number;
  name: string;
}

export interface WorkbookDetails {
  info: WorkbookInfo;
  sheets: WorksheetInfo[];
}

export interface WorksheetPreview {
  info: WorksheetInfo;
  rowCount: number;
  columnWidths: number[];
  cells: { row: number; column: number; display: string; text: string | null }[];
  merges: { row: number; column: number; rowSpan: number; columnSpan: number }[];
}

export interface CellFinding {
  sheetNumber: number;
  row: number;
  column: number;
  start: number | null;
  original: string;
  suggestion: string;
  reason: string;
}

export interface SavedCellFinding {
  id: string;
  finding: CellFinding;
}

export interface WorksheetCheck {
  candidates: CellFinding[];
  processed: number;
  total: number;
  skipped: number;
  nextOffset: number | null;
}

export function cellAddress(row: number, column: number): string {
  let letters = '';
  for (let value = column; value > 0; value = Math.floor((value - 1) / 26)) {
    letters = String.fromCharCode(65 + (value - 1) % 26) + letters;
  }
  return letters + row;
}
