using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using PdfHighlightDemo.Business;

namespace PdfHighlightDemo.Infrastructure;

internal sealed class DemoRepository(DemoDbContext db) : IDemoRepository
{
    public async Task<IReadOnlyList<DocumentInfo>> ListDocumentsAsync(CancellationToken ct) =>
        await db.Documents.AsNoTracking().OrderByDescending(row => row.CreatedAt).ThenBy(row => row.Id)
            .Select(row => new DocumentInfo(row.Id, row.FileName, row.PageCount, row.CreatedAt)).ToListAsync(ct);

    public Task<StoredDocument?> FindDocumentAsync(Guid id, CancellationToken ct) =>
        db.Documents.AsNoTracking().Where(row => row.Id == id)
            .Select(row => new StoredDocument(new DocumentInfo(row.Id, row.FileName, row.PageCount, row.CreatedAt),
                row.StorageKey)).SingleOrDefaultAsync(ct);

    public async Task AddDocumentAsync(StoredDocument document, CancellationToken ct)
    {
        var info = document.Info;
        db.Documents.Add(new DocumentEntity
        {
            Id = info.Id,
            FileName = info.FileName,
            PageCount = info.PageCount,
            CreatedAt = info.CreatedAt,
            StorageKey = document.StorageKey
        });
        await db.SaveChangesAsync(ct);
    }

    public async Task<bool> DeleteDocumentAsync(Guid id, CancellationToken ct) =>
        await db.Documents.Where(row => row.Id == id).ExecuteDeleteAsync(ct) > 0;

    public async Task<IReadOnlyList<HighlightInfo>> ListHighlightsAsync(Guid documentId, CancellationToken ct) =>
        await db.Highlights.AsNoTracking().Where(row => row.DocumentId == documentId)
            .OrderBy(row => row.CreatedAt).ThenBy(row => row.Id)
            .Select(row => new HighlightInfo(row.Id, row.DocumentId, row.PageNumber,
                new PageRectangle(row.Left, row.Top, row.Right, row.Bottom), row.Description, row.CreatedAt))
            .ToListAsync(ct);

    public async Task<HighlightInfo> AddHighlightAsync(HighlightInfo highlight, CancellationToken ct)
    {
        db.Highlights.Add(new HighlightEntity
        {
            Id = highlight.Id,
            DocumentId = highlight.DocumentId,
            PageNumber = highlight.PageNumber,
            Left = highlight.Rectangle.Left,
            Top = highlight.Rectangle.Top,
            Right = highlight.Rectangle.Right,
            Bottom = highlight.Rectangle.Bottom,
            Description = highlight.Description,
            CreatedAt = highlight.CreatedAt
        });

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException error) when (error.InnerException is SqliteException { SqliteExtendedErrorCode: 1555 })
        {
            // A repeated adoption uses the original candidate's ID.
            var existing = await db.Highlights.AsNoTracking().Where(row => row.Id == highlight.Id)
                .Select(row => new HighlightInfo(row.Id, row.DocumentId, row.PageNumber,
                    new PageRectangle(row.Left, row.Top, row.Right, row.Bottom), row.Description, row.CreatedAt))
                .SingleOrDefaultAsync(ct);
            if (existing is not null && (existing with { CreatedAt = highlight.CreatedAt }) == highlight)
                return existing;

            throw new InvalidInputException("このハイライトIDは別の範囲ですでに使用されています。");
        }
        catch (DbUpdateException error) when (error.InnerException is SqliteException { SqliteExtendedErrorCode: 787 })
        {
            // The document may have been deleted between validation and insertion.
            throw new DocumentNotFoundException();
        }
        return highlight;
    }

    public async Task<bool> DeleteHighlightAsync(Guid id, CancellationToken ct) =>
        await db.Highlights.Where(row => row.Id == id).ExecuteDeleteAsync(ct) > 0;
}
