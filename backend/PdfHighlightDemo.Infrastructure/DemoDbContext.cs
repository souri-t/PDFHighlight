using Microsoft.EntityFrameworkCore;

namespace PdfHighlightDemo.Infrastructure;

internal sealed class DemoDbContext(DbContextOptions<DemoDbContext> options) : DbContext(options)
{
    internal DbSet<DocumentEntity> Documents => Set<DocumentEntity>();
    internal DbSet<HighlightEntity> Highlights => Set<HighlightEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<DocumentEntity>(document =>
        {
            document.ToTable("Documents");
            document.HasIndex(item => item.StorageKey).IsUnique();
            document.Property(item => item.CreatedAt)
                .HasConversion(time => time, time => DateTime.SpecifyKind(time, DateTimeKind.Utc));
        });

        modelBuilder.Entity<HighlightEntity>(highlight =>
        {
            highlight.ToTable("Highlights", table => table.HasCheckConstraint("CK_Highlight_Rectangle",
                "\"PageNumber\" >= 1 AND \"Left\" >= 0 AND \"Top\" >= 0 AND \"Right\" <= 1 " +
                "AND \"Bottom\" <= 1 AND \"Left\" < \"Right\" AND \"Top\" < \"Bottom\""));
            highlight.HasOne<DocumentEntity>().WithMany().HasForeignKey(item => item.DocumentId)
                .OnDelete(DeleteBehavior.Cascade);
            highlight.HasIndex(item => new { item.DocumentId, item.CreatedAt });
            highlight.Property(item => item.CreatedAt)
                .HasConversion(time => time, time => DateTime.SpecifyKind(time, DateTimeKind.Utc));
        });
    }
}

internal sealed class DocumentEntity
{
    public Guid Id { get; init; }
    public required string FileName { get; init; }
    public required string StorageKey { get; init; }
    public int PageCount { get; init; }
    public DateTime CreatedAt { get; init; }
}

internal sealed class HighlightEntity
{
    public Guid Id { get; init; }
    public Guid DocumentId { get; init; }
    public int PageNumber { get; init; }
    public double Left { get; init; }
    public double Top { get; init; }
    public double Right { get; init; }
    public double Bottom { get; init; }
    public required string Description { get; init; }
    public DateTime CreatedAt { get; init; }
}
