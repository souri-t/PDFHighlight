namespace PdfHighlightDemo.Business;

public interface IDemoRepository
{
    Task<IReadOnlyList<DocumentInfo>> ListDocumentsAsync(CancellationToken cancellationToken);
    Task<StoredDocument?> FindDocumentAsync(Guid id, CancellationToken cancellationToken);
    Task AddDocumentAsync(StoredDocument document, CancellationToken cancellationToken);
    Task<bool> DeleteDocumentAsync(Guid id, CancellationToken cancellationToken);
    Task<IReadOnlyList<HighlightInfo>> ListHighlightsAsync(Guid documentId, CancellationToken cancellationToken);
    Task AddHighlightAsync(HighlightInfo highlight, CancellationToken cancellationToken);
    Task<bool> DeleteHighlightAsync(Guid id, CancellationToken cancellationToken);
}

public interface IPdfStorage
{
    Task<int> SaveAsync(string key, Stream source, CancellationToken cancellationToken);
    Stream? OpenRead(string key);
    void Delete(string key);
}
