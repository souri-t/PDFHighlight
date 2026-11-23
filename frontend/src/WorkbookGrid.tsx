import { useEffect, useRef } from 'react';
import jspreadsheet from 'jspreadsheet-ce';
import 'jsuites/dist/jsuites.css';
import 'jspreadsheet-ce/dist/jspreadsheet.css';
import { cellAddress, type CellFinding, type WorksheetPreview } from './workbookModels';

export function WorkbookGrid({ sheet, selected }: { sheet: WorksheetPreview; selected: CellFinding | null }) {
  const host = useRef<HTMLDivElement>(null);
  const grid = useRef<jspreadsheet.WorksheetInstance>();
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const columns = sheet.columnWidths.map((width, index) => ({
      title: cellAddress(1, index + 1).slice(0, -1), type: 'text' as const, width, readOnly: true,
    }));
    const data = Array.from({ length: sheet.rowCount }, () => columns.map(() => ''));
    for (const cell of sheet.cells) {
      const row = data[cell.row - 1];
      if (row) row[cell.column - 1] = cell.display;
    }
    const mergeCells: Record<string, [number, number]> = {};
    for (const merge of sheet.merges) {
      mergeCells[cellAddress(merge.row, merge.column)] = [merge.columnSpan, merge.rowSpan];
    }
    [grid.current] = jspreadsheet(element, {
      parseHTML: false,
      parseFormulas: false,
      contextMenu: () => [],
      worksheets: [{
        data, columns, mergeCells, editable: false, columnSorting: false,
        allowInsertRow: false, allowInsertColumn: false, allowDeleteRow: false, allowDeleteColumn: false,
        allowManualInsertRow: false, allowManualInsertColumn: false, allowRenameColumn: false,
      }],
    });
    return () => {
      jspreadsheet.destroy(element as jspreadsheet.JspreadsheetInstanceElement);
      grid.current = undefined;
    };
  }, [sheet]);

  useEffect(() => {
    const element = host.current;
    element?.querySelector('.workbook-cell-target')?.classList.remove('workbook-cell-target');
    if (!selected || sheet.info.number !== selected.sheetNumber) return;
    const x = selected.column - 1;
    const y = selected.row - 1;
    const cell = element?.querySelector(`td[data-x="${x}"][data-y="${y}"]`);
    cell?.classList.add('workbook-cell-target');
    grid.current?.updateSelectionFromCoords(x, y, x, y);
    cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [sheet, selected]);

  return <div className="workbook-grid-scroll" aria-label="Excelプレビュー"><div ref={host} /></div>;
}
