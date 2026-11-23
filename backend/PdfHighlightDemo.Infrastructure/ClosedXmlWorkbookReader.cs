using System.Globalization;
using System.IO.Compression;
using ClosedXML.Excel;
using PdfHighlightDemo.Business;

namespace PdfHighlightDemo.Infrastructure;

internal sealed class ClosedXmlWorkbookReader : IWorkbookReader
{
    private const int MaxSheetCells = 20_000;
    private const int MaxWorkbookCells = 100_000;

    public IReadOnlyList<WorksheetPreview> Read(byte[] contents)
    {
        try
        {
            using var stream = new MemoryStream(contents, writable: false);
            using (var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: true))
            {
                if (archive.Entries.Count > 2048 || archive.Entries.Sum(entry => entry.Length) > 64L * 1024 * 1024 ||
                    archive.Entries.Any(entry => entry.FullName.EndsWith("vbaProject.bin", StringComparison.OrdinalIgnoreCase)))
                    throw new InvalidInputException("展開サイズが上限を超えているか、マクロを含むブックです。");
            }

            stream.Position = 0;
            using var workbook = new XLWorkbook(stream);
            var sheets = new List<WorksheetPreview>();
            var workbookCells = 0L;
            foreach (var sheet in workbook.Worksheets.Where(sheet => sheet.Visibility == XLWorksheetVisibility.Visible))
            {
                var merges = sheet.MergedRanges.Select(range =>
                {
                    var first = range.RangeAddress.FirstAddress;
                    return new WorksheetMerge(first.RowNumber, first.ColumnNumber, range.RowCount(), range.ColumnCount());
                }).ToArray();

                var rows = Math.Max(sheet.LastRowUsed()?.RowNumber() ?? 1,
                    merges.Select(merge => merge.Row + merge.RowSpan - 1).DefaultIfEmpty(1).Max());
                var columns = Math.Max(sheet.LastColumnUsed()?.ColumnNumber() ?? 1,
                    merges.Select(merge => merge.Column + merge.ColumnSpan - 1).DefaultIfEmpty(1).Max());
                workbookCells += (long)rows * columns;
                if ((long)rows * columns > MaxSheetCells || workbookCells > MaxWorkbookCells)
                    throw new InvalidInputException("表示範囲は1シート20,000セル、ブック全体100,000セルまでです。");

                var covered = new HashSet<(int Row, int Column)>();
                foreach (var merge in merges)
                {
                    for (var row = merge.Row; row < merge.Row + merge.RowSpan; row++)
                        for (var column = merge.Column; column < merge.Column + merge.ColumnSpan; column++)
                            if (row != merge.Row || column != merge.Column)
                                covered.Add((row, column));
                }

                var cells = sheet.CellsUsed().Where(cell => !covered.Contains(
                    (cell.Address.RowNumber, cell.Address.ColumnNumber))).Select(cell => new WorksheetCell(cell.Address.RowNumber,
                    cell.Address.ColumnNumber,
                    cell.HasFormula ? cell.CachedValue.ToString(CultureInfo.InvariantCulture) :
                        cell.GetFormattedString(CultureInfo.GetCultureInfo("ja-JP")),
                    !cell.HasFormula && cell.DataType == XLDataType.Text ? cell.GetString() : null))
                    .OrderBy(cell => cell.Row).ThenBy(cell => cell.Column).ToArray();
                var widths = Enumerable.Range(1, columns).Select(number =>
                    (int)Math.Clamp(sheet.Column(number).Width * 7 + 5, 28, 1000)).ToArray();
                sheets.Add(new(new WorksheetInfo(sheet.Position, sheet.Name), rows, widths, cells, merges));
            }
            return sheets;
        }
        catch (Exception error) when (error is not (InvalidInputException or OutOfMemoryException))
        {
            throw new InvalidInputException("Excelファイルを読み取れませんでした。.xlsx の形式を確認してください。");
        }
    }
}
