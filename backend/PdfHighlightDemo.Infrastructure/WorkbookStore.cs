using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using PdfHighlightDemo.Business;

namespace PdfHighlightDemo.Infrastructure;

internal sealed class WorkbookDbContext(DbContextOptions<WorkbookDbContext> options) : DbContext(options)
{
    public DbSet<WorkbookEntry> Workbooks => Set<WorkbookEntry>();
    public DbSet<WorksheetEntry> Worksheets => Set<WorksheetEntry>();
    public DbSet<CellFindingEntry> Findings => Set<CellFindingEntry>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        builder.Entity<WorksheetEntry>().HasKey(sheet => new { sheet.WorkbookId, sheet.Number });
        builder.Entity<WorksheetEntry>().HasOne<WorkbookEntry>().WithMany()
            .HasForeignKey(sheet => sheet.WorkbookId).OnDelete(DeleteBehavior.Cascade);
        builder.Entity<CellFindingEntry>().HasOne<WorksheetEntry>().WithMany()
            .HasForeignKey(finding => new { finding.WorkbookId, finding.SheetNumber }).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class WorkbookEntry
{
    public Guid Id { get; init; }
    public required string FileName { get; init; }
    public DateTime CreatedAt { get; init; }
    public required byte[] Contents { get; init; }
}

internal sealed class WorksheetEntry
{
    public Guid WorkbookId { get; init; }
    public int Number { get; init; }
    public required string Name { get; init; }
    public required string PreviewJson { get; init; }
}

internal sealed class CellFindingEntry
{
    public Guid Id { get; init; }
    public Guid WorkbookId { get; init; }
    public int SheetNumber { get; init; }
    public int Row { get; init; }
    public int Column { get; init; }
    public int Start { get; init; }
    public required string Original { get; init; }
    public required string Suggestion { get; init; }
    public required string Reason { get; init; }

    public SavedCellFinding ToResult() => new(Id, new(SheetNumber, Row, Column, Start, Original, Suggestion, Reason));
}

internal sealed class WorkbookStore(WorkbookDbContext db) : IWorkbookStore
{
    public async Task<IReadOnlyList<WorkbookInfo>> ListAsync(CancellationToken ct) =>
        await db.Workbooks.OrderByDescending(row => row.CreatedAt).Select(row =>
            new WorkbookInfo(row.Id, row.FileName, row.CreatedAt)).ToListAsync(ct);

    public async Task AddAsync(WorkbookInfo workbook, byte[] contents, IReadOnlyList<WorksheetPreview> sheets,
        CancellationToken ct)
    {
        db.Workbooks.Add(new WorkbookEntry { Id = workbook.Id, FileName = workbook.FileName,
            CreatedAt = workbook.CreatedAt, Contents = contents });
        db.Worksheets.AddRange(sheets.Select(sheet => new WorksheetEntry { WorkbookId = workbook.Id,
            Number = sheet.Info.Number, Name = sheet.Info.Name, PreviewJson = JsonSerializer.Serialize(sheet) }));
        await db.SaveChangesAsync(ct);
    }

    public async Task<WorkbookDetails?> GetAsync(Guid id, CancellationToken ct)
    {
        var info = await db.Workbooks.Where(row => row.Id == id).Select(row =>
            new WorkbookInfo(row.Id, row.FileName, row.CreatedAt)).SingleOrDefaultAsync(ct);
        if (info is null) return null;
        var sheets = await db.Worksheets.Where(row => row.WorkbookId == id).OrderBy(row => row.Number)
            .Select(row => new WorksheetInfo(row.Number, row.Name)).ToListAsync(ct);
        return new(info, sheets);
    }

    public async Task<WorksheetPreview?> ReadSheetAsync(Guid id, int number, CancellationToken ct)
    {
        var json = await db.Worksheets.Where(row => row.WorkbookId == id && row.Number == number)
            .Select(row => row.PreviewJson).SingleOrDefaultAsync(ct);
        return json is null ? null : JsonSerializer.Deserialize<WorksheetPreview>(json);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct) =>
        await db.Workbooks.Where(row => row.Id == id).ExecuteDeleteAsync(ct) > 0;

    public async Task<IReadOnlyList<SavedCellFinding>> ListFindingsAsync(Guid id, CancellationToken ct) =>
        (await db.Findings.AsNoTracking().Where(row => row.WorkbookId == id).OrderBy(row => row.SheetNumber)
            .ThenBy(row => row.Row).ThenBy(row => row.Column).ThenBy(row => row.Start).ToListAsync(ct))
        .Select(row => row.ToResult()).ToArray();

    public async Task<SavedCellFinding> SaveFindingAsync(Guid id, CellFinding finding, CancellationToken ct)
    {
        // The same adopted correction has the same key even across checks or concurrent requests.
        var key = JsonSerializer.SerializeToUtf8Bytes(new { id, finding.SheetNumber, finding.Row, finding.Column,
            finding.Start, finding.Original, finding.Suggestion });
        var row = new CellFindingEntry { Id = new Guid(SHA256.HashData(key).AsSpan(0, 16)), WorkbookId = id,
            SheetNumber = finding.SheetNumber, Row = finding.Row, Column = finding.Column, Start = finding.Start!.Value,
            Original = finding.Original, Suggestion = finding.Suggestion, Reason = finding.Reason };
        db.Findings.Add(row);

        try
        {
            await db.SaveChangesAsync(ct);
            return row.ToResult();
        }
        catch (DbUpdateException error) when (error.InnerException is SqliteException { SqliteExtendedErrorCode: 1555 })
        {
            return (await db.Findings.AsNoTracking().SingleAsync(item => item.Id == row.Id, ct)).ToResult();
        }
        catch (DbUpdateException error) when (error.InnerException is SqliteException { SqliteExtendedErrorCode: 787 })
        {
            throw new WorkbookNotFoundException();
        }
    }
}
