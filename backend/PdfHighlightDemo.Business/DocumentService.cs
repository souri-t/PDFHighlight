namespace PdfHighlightDemo.Business;

public sealed class DocumentService(IDemoRepository repository, IPdfStorage storage)
{
    public const long MaxUploadBytes = 50 * 1024 * 1024;
    public const int MaxDescriptionLength = 2000;

    public Task<IReadOnlyList<DocumentInfo>> ListDocumentsAsync(CancellationToken ct) =>
        repository.ListDocumentsAsync(ct);

    public async Task<DocumentInfo> GetDocumentAsync(Guid id, CancellationToken ct) =>
        (await RequireDocumentAsync(id, ct)).Info;

    public async Task<DocumentInfo> UploadAsync(string fileName, long length, Stream contents, CancellationToken ct)
    {
        var safeName = Path.GetFileName(fileName.Replace('\\', '/')).Trim();
        if (safeName.Length is 0 or > 255 ||
            !string.Equals(Path.GetExtension(safeName), ".pdf", StringComparison.OrdinalIgnoreCase))
            throw new InvalidInputException("拡張子が .pdf のファイルを選択してください。");

        if (length is <= 0 or > MaxUploadBytes)
            throw new InvalidInputException("ファイルサイズは 1 バイト以上、50 MiB 以下にしてください。");

        var id = Guid.NewGuid();
        var key = $"{id:N}.pdf";
        var pageCount = await storage.SaveAsync(key, contents, ct);
        var document = new DocumentInfo(id, safeName, pageCount, DateTime.UtcNow);

        try
        {
            await repository.AddDocumentAsync(new StoredDocument(document, key), ct);
        }
        catch
        {
            storage.Delete(key);
            throw;
        }

        return document;
    }

    public async Task<DocumentContent> OpenContentAsync(Guid id, CancellationToken ct)
    {
        var document = await RequireDocumentAsync(id, ct);
        var stream = storage.OpenRead(document.StorageKey) ?? throw new DocumentNotFoundException();
        return new DocumentContent(stream, document.Info.CreatedAt);
    }

    public async Task DeleteDocumentAsync(Guid id, CancellationToken ct)
    {
        var document = await RequireDocumentAsync(id, ct);
        if (!await repository.DeleteDocumentAsync(id, ct))
            throw new DocumentNotFoundException();

        storage.Delete(document.StorageKey);
    }

    public async Task<IReadOnlyList<HighlightInfo>> ListHighlightsAsync(Guid documentId, CancellationToken ct)
    {
        await RequireDocumentAsync(documentId, ct);
        return await repository.ListHighlightsAsync(documentId, ct);
    }

    public async Task<HighlightInfo> AddHighlightAsync(Guid documentId, NewHighlight request, CancellationToken ct)
    {
        var document = await RequireDocumentAsync(documentId, ct);
        var rectangle = request.Rectangle;
        var description = request.Description?.Trim() ?? "";

        if (request.PageNumber < 1 || request.PageNumber > document.Info.PageCount)
            throw new InvalidInputException("ページ番号がPDFの範囲外です。");

        if (rectangle is null || !rectangle.IsValid())
            throw new InvalidInputException("矩形座標はページ内の 0〜1 の範囲で指定してください。");

        if (description.Length > MaxDescriptionLength)
            throw new InvalidInputException("説明は2,000文字以内で入力してください。");

        if (request.Id == Guid.Empty)
            throw new InvalidInputException("ハイライトIDが不正です。");

        var highlight = new HighlightInfo(request.Id ?? Guid.NewGuid(), documentId, request.PageNumber,
            rectangle, description, DateTime.UtcNow);
        return await repository.AddHighlightAsync(highlight, ct);
    }

    public Task<bool> DeleteHighlightAsync(Guid id, CancellationToken ct) =>
        repository.DeleteHighlightAsync(id, ct);

    private async Task<StoredDocument> RequireDocumentAsync(Guid id, CancellationToken ct) =>
        await repository.FindDocumentAsync(id, ct) ?? throw new DocumentNotFoundException();
}
