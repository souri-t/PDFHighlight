namespace PdfHighlightDemo.Business;

public sealed record WorkbookInfo(Guid Id, string FileName, DateTime CreatedAt);
public sealed record WorksheetInfo(int Number, string Name);
public sealed record WorkbookDetails(WorkbookInfo Info, IReadOnlyList<WorksheetInfo> Sheets);
public sealed record WorksheetCell(int Row, int Column, string Display, string? Text);
public sealed record WorksheetMerge(int Row, int Column, int RowSpan, int ColumnSpan);
public sealed record WorksheetPreview(WorksheetInfo Info, int RowCount, IReadOnlyList<int> ColumnWidths,
    IReadOnlyList<WorksheetCell> Cells, IReadOnlyList<WorksheetMerge> Merges);
public sealed record CellFinding(int SheetNumber, int Row, int Column, int? Start, string Original, string Suggestion,
    string Reason);
public sealed record SavedCellFinding(Guid Id, CellFinding Finding);
public sealed record WorksheetCheck(IReadOnlyList<CellFinding> Candidates, int Processed, int Total, int Skipped, int? NextOffset);

public sealed class WorkbookNotFoundException() : Exception("Excelファイルまたはシートが見つかりません。");

public interface IWorkbookReader
{
    IReadOnlyList<WorksheetPreview> Read(byte[] contents);
}

public interface IWorkbookStore
{
    Task<IReadOnlyList<WorkbookInfo>> ListAsync(CancellationToken ct);
    Task AddAsync(WorkbookInfo workbook, byte[] contents, IReadOnlyList<WorksheetPreview> sheets, CancellationToken ct);
    Task<WorkbookDetails?> GetAsync(Guid id, CancellationToken ct);
    Task<WorksheetPreview?> ReadSheetAsync(Guid id, int number, CancellationToken ct);
    Task<bool> DeleteAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<SavedCellFinding>> ListFindingsAsync(Guid id, CancellationToken ct);
    Task<SavedCellFinding> SaveFindingAsync(Guid id, CellFinding finding, CancellationToken ct);
}

public sealed class WorkbookReview(IWorkbookReader reader, IWorkbookStore store, IProofreadingModel model)
{
    public const int MaxUploadBytes = 10 * 1024 * 1024;
    private const int BatchCharacters = 3000;
    private const int BatchCells = 60;

    public Task<IReadOnlyList<WorkbookInfo>> ListAsync(CancellationToken ct) => store.ListAsync(ct);

    public async Task<WorkbookDetails> GetAsync(Guid id, CancellationToken ct) =>
        await store.GetAsync(id, ct) ?? throw new WorkbookNotFoundException();

    public async Task<WorksheetPreview> ReadSheetAsync(Guid id, int number, CancellationToken ct) =>
        await store.ReadSheetAsync(id, number, ct) ?? throw new WorkbookNotFoundException();

    public async Task<WorkbookInfo> UploadAsync(string fileName, byte[] contents, CancellationToken ct)
    {
        var name = Path.GetFileName(fileName.Replace('\\', '/')).Trim();
        if (name.Length is 0 or > 255 || !name.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
            throw new InvalidInputException(".xlsx ファイルを選択してください。");
        if (contents.Length is 0 or > MaxUploadBytes)
            throw new InvalidInputException("Excelファイルは10 MiB以下にしてください。");
        var sheets = reader.Read(contents);
        if (sheets.Count == 0)
            throw new InvalidInputException("表示できるシートがありません。");

        var workbook = new WorkbookInfo(Guid.NewGuid(), name, DateTime.UtcNow);
        await store.AddAsync(workbook, contents, sheets, ct);
        return workbook;
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct)
    {
        if (!await store.DeleteAsync(id, ct))
            throw new WorkbookNotFoundException();
    }

    public async Task<IReadOnlyList<SavedCellFinding>> ListFindingsAsync(Guid id, CancellationToken ct)
    {
        await GetAsync(id, ct);
        return await store.ListFindingsAsync(id, ct);
    }

    public async Task<SavedCellFinding> AdoptAsync(Guid id, CellFinding finding, CancellationToken ct)
    {
        var sheet = await ReadSheetAsync(id, finding.SheetNumber, ct);
        var text = sheet.Cells.FirstOrDefault(cell => cell.Row == finding.Row && cell.Column == finding.Column)?.Text;
        if (text is null || finding.Start is not int start || start < 0 || start > text.Length ||
            !IsValid(finding.Original, finding.Suggestion, finding.Reason) ||
            !text.AsSpan(start).StartsWith(finding.Original, StringComparison.Ordinal))
            throw new InvalidInputException("指摘の原文とセルの文字範囲が一致しません。");

        return await store.SaveFindingAsync(id, finding, ct);
    }

    public async Task<WorksheetCheck> CheckAsync(Guid id, int number, int offset, CancellationToken ct)
    {
        var sheet = await ReadSheetAsync(id, number, ct);
        var cells = sheet.Cells.Where(cell => !string.IsNullOrWhiteSpace(cell.Text)).ToArray();
        if (offset < 0 || offset > cells.Length)
            throw new InvalidInputException("チェックの開始位置が不正です。");

        var batch = new Dictionary<string, WorksheetCell>();
        var length = 0;
        var skipped = 0;
        var cursor = offset;
        while (cursor < cells.Length && cursor - offset < BatchCells)
        {
            var cell = cells[cursor];
            var count = cell.Text!.Length;
            if (count <= BatchCharacters && length + count > BatchCharacters)
                break;
            if (count > BatchCharacters)
                skipped++;
            else
            {
                batch.Add($"R{cell.Row}C{cell.Column}", cell);
                length += count;
            }
            cursor++;
        }

        var candidates = new List<CellFinding>();
        var seen = new HashSet<(string Cell, int? Start, string Original, string Suggestion)>();
        if (batch.Count > 0)
        {
            var results = await model.CheckAsync(batch.Select(entry => new ProofreadingText(entry.Key, entry.Value.Text!))
                .ToArray(), ct);
            foreach (var result in results)
            {
                var original = result.Original?.Trim() ?? "";
                var suggestion = result.Suggestion?.Trim() ?? "";
                var reason = result.Reason?.Trim() ?? "";
                if (!IsValid(original, suggestion, reason) || result.SegmentId is null ||
                    !batch.TryGetValue(result.SegmentId, out var cell))
                    continue;
                var start = Locate(cell.Text!, original, result);
                if (seen.Add((result.SegmentId, start, original, suggestion)))
                    candidates.Add(new(number, cell.Row, cell.Column, start, original, suggestion, reason));
            }
        }

        return new(candidates, cursor, cells.Length, skipped, cursor < cells.Length ? cursor : null);
    }

    private static bool IsValid(string? original, string? suggestion, string? reason) =>
        original is { Length: > 0 and <= 200 } && suggestion is { Length: <= 200 } &&
        reason is { Length: <= 500 } && original != suggestion;

    private static int? Locate(string text, string original, ProofreadingFinding finding)
    {
        var first = text.IndexOf(original, StringComparison.Ordinal);
        if (first < 0) return null;
        if (text.IndexOf(original, first + 1, StringComparison.Ordinal) < 0) return first;

        int? match = null;
        for (var index = first; index >= 0; index = text.IndexOf(original, index + 1, StringComparison.Ordinal))
        {
            if (!text.AsSpan(0, index).EndsWith(finding.Before ?? "", StringComparison.Ordinal) ||
                !text.AsSpan(index + original.Length).StartsWith(finding.After ?? "", StringComparison.Ordinal))
                continue;
            if (match.HasValue) return null;
            match = index;
        }
        return match;
    }
}
