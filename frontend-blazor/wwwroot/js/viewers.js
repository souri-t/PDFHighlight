export function observeViewport(element, receiver) {
  let frame = 0;
  let last = '';
  const refresh = () => {
    frame = 0;
    const top = element.scrollTop;
    const height = element.clientHeight;
    const bottom = top + height;
    const nearby = [];
    let current = 1;
    let mostVisible = -1;
    for (const page of element.querySelectorAll('[data-page-number]')) {
      const start = page.offsetTop;
      const end = start + page.offsetHeight;
      const number = Number(page.dataset.pageNumber);
      if (end >= top - height * 0.25 && start <= bottom + height * 0.25) nearby.push(number);
      const visible = Math.max(0, Math.min(bottom, end) - Math.max(top, start));
      if (visible > mostVisible) {
        mostVisible = visible;
        current = number;
      }
    }
    const metrics = [element.clientWidth, window.devicePixelRatio, current, nearby];
    const key = JSON.stringify(metrics);
    if (key !== last && nearby.length) {
      last = key;
      receiver.invokeMethodAsync('ViewportChanged', ...metrics).catch(() => {});
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(refresh); };
  const capture = (event) => {
    if (event.button === 0 && event.target.classList.contains('pdf-drag-surface')) {
      event.target.setPointerCapture(event.pointerId);
    }
  };
  const resize = new ResizeObserver(schedule);
  resize.observe(element);
  const content = new ResizeObserver(schedule);
  content.observe(element.firstElementChild);
  element.addEventListener('scroll', schedule, { passive: true });
  element.addEventListener('pointerdown', capture);
  schedule();
  return {
    disconnect() {
      resize.disconnect();
      content.disconnect();
      cancelAnimationFrame(frame);
      element.removeEventListener('scroll', schedule);
      element.removeEventListener('pointerdown', capture);
    },
  };
}

export function focusPdfRegion(element, pageNumber, left, top) {
  const page = element.querySelector(`[data-page-number="${pageNumber}"]`);
  if (!page) return;
  element.scrollTo({
    top: page.offsetTop + top * page.offsetHeight - 20,
    left: Math.max(0, page.offsetLeft + left * page.offsetWidth - 35),
  });
}

export function createPageUrl(bytes) {
  return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
}

export function releasePageUrl(url) {
  URL.revokeObjectURL(url);
}

// Browser font metrics let the invisible selection layer follow the PDF's horizontal advances.
export function fitTextLayer(element) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  for (const run of element.querySelectorAll('.pdf-text-run')) {
    const style = getComputedStyle(run);
    const font = `${style.fontSize} ${style.fontFamily}`;
    if (context.font !== font) context.font = font;
    const width = context.measureText(run.textContent).width;
    if (width > 0) {
      const target = Number(run.dataset.runWidth) * parseFloat(style.fontSize);
      run.style.setProperty('--run-scale', target / width);
    }
  }
}

export function mountSheet(element, sheet) {
  const columns = sheet.columnWidths.map((width) => ({ type: 'text', width, readOnly: true }));
  const data = Array.from({ length: sheet.rowCount }, () => columns.map(() => ''));
  for (const cell of sheet.cells) data[cell.row - 1][cell.column - 1] = cell.display;
  const mergeCells = Object.fromEntries(sheet.merges.map(({ address, columnSpan, rowSpan }) =>
    [address, [columnSpan, rowSpan]]));
  const [grid] = window.jspreadsheet(element, {
    parseHTML: false,
    parseFormulas: false,
    contextMenu: () => [],
    worksheets: [{
      data, columns, mergeCells, editable: false, columnSorting: false,
      allowInsertRow: false, allowInsertColumn: false, allowDeleteRow: false, allowDeleteColumn: false,
      allowManualInsertRow: false, allowManualInsertColumn: false, allowRenameColumn: false,
    }],
  });
  return {
    focus(row, column) {
      element.querySelector('.workbook-cell-target')?.classList.remove('workbook-cell-target');
      if (row === null || column === null) return;
      const cell = element.querySelector(`td[data-x="${column - 1}"][data-y="${row - 1}"]`);
      cell?.classList.add('workbook-cell-target');
      grid.updateSelectionFromCoords(column - 1, row - 1, column - 1, row - 1);
      cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },
    dispose() {
      window.jspreadsheet.destroy(element);
    },
  };
}
