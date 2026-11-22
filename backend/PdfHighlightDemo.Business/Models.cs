namespace PdfHighlightDemo.Business;

public sealed record DocumentInfo(Guid Id, string FileName, int PageCount, DateTime CreatedAt);

public sealed record StoredDocument(DocumentInfo Info, string StorageKey);

public sealed record DocumentContent(Stream Stream, DateTime CreatedAt);

// Coordinates are fractions of the displayed PDF page, from its top-left corner.
public sealed record PageRectangle(double Left, double Top, double Right, double Bottom)
{
    public bool IsValid() => Left >= 0 && Top >= 0 && Right <= 1 && Bottom <= 1
        && Left < Right && Top < Bottom;
}

public sealed record HighlightInfo(
    Guid Id, Guid DocumentId, int PageNumber, PageRectangle Rectangle, string Description, DateTime CreatedAt);

public sealed record NewHighlight(int PageNumber, PageRectangle? Rectangle, string? Description, Guid? Id = null);

public sealed class InvalidInputException(string message) : Exception(message);

public sealed class DocumentNotFoundException() : Exception("PDFが見つかりません。");
