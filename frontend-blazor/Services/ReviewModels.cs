namespace BlazorFrontend.Services;

public record DocumentInfo(Guid Id, string FileName, int PageCount, DateTime CreatedAt);
public record PageRectangle(double Left, double Top, double Right, double Bottom);
public record Highlight(Guid Id, int PageNumber, PageRectangle Rectangle, string Description);
public record NewHighlight(int PageNumber, PageRectangle Rectangle, string Description, Guid? Id = null);
public record PdfCandidate(Guid Id, int PageNumber, string Original, string Suggestion, string Reason, PageRectangle? Rectangle);
public record CheckPage(int PageNumber, string Status, List<PdfCandidate> Candidates, string? Message);
public record PdfCheck(Guid Id, string Status, int FirstPage, int LastPage, int TotalPages, int ProcessedPages,
    int? CurrentPage, List<CheckPage> Pages, string? Message)
{
    public bool Active => Status is "queued" or "running";
}

public record WorkbookInfo(Guid Id, string FileName, DateTime CreatedAt);
public record WorksheetInfo(int Number, string Name);
public record WorkbookDetails(WorkbookInfo Info, List<WorksheetInfo> Sheets);
public record WorksheetCell(int Row, int Column, string Display, string? Text);
public record WorksheetMerge(int Row, int Column, int RowSpan, int ColumnSpan);
public record WorksheetPreview(WorksheetInfo Info, int RowCount, List<int> ColumnWidths,
    List<WorksheetCell> Cells, List<WorksheetMerge> Merges);
public record CellFinding(int SheetNumber, int Row, int Column, int? Start, string Original, string Suggestion, string Reason)
{
    public string Address => CellAddress(Row, Column);

    public static string CellAddress(int row, int column)
    {
        var letters = "";
        for (var value = column; value > 0; value = (value - 1) / 26)
            letters = (char)('A' + (value - 1) % 26) + letters;
        return letters + row;
    }

    public bool SameAs(CellFinding other) => SheetNumber == other.SheetNumber && Row == other.Row &&
        Column == other.Column && Start == other.Start && Original == other.Original && Suggestion == other.Suggestion;
}
public record SavedFinding(Guid Id, CellFinding Finding);
public record WorksheetCheck(List<CellFinding> Candidates, int Processed, int Total, int Skipped, int? NextOffset);
