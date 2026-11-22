using System.Threading.Channels;
using PdfHighlightDemo.Business;

namespace PdfHighlightDemo.Api;

public sealed class ProofreadingJobs(IServiceScopeFactory scopes, ILogger<ProofreadingJobs> logger) : BackgroundService
{
    private const int RetainedJobs = 32;
    private readonly Channel<CheckJob> queue = Channel.CreateBounded<CheckJob>(8);
    private readonly Dictionary<Guid, CheckJob> jobs = [];
    private readonly object gate = new();

    internal StartResult TryStart(Guid documentId, int firstPage, int lastPage, out CheckSnapshot? snapshot)
    {
        lock (gate)
        {
            snapshot = null;
            if (jobs.TryGetValue(documentId, out var current) && current.IsActive)
                return StartResult.AlreadyRunning;

            var job = new CheckJob(documentId, firstPage, lastPage);
            if (!queue.Writer.TryWrite(job))
                return StartResult.QueueFull;

            if (current is null && jobs.Count >= RetainedJobs)
            {
                var oldest = jobs.Values.Where(item => !item.IsActive).MinBy(item => item.CreatedAt);
                if (oldest is not null)
                    jobs.Remove(oldest.DocumentId);
            }
            jobs[documentId] = job;
            snapshot = job.Snapshot();
            return StartResult.Accepted;
        }
    }

    internal CheckSnapshot? Find(Guid documentId, Guid? checkId = null)
    {
        lock (gate)
        {
            return jobs.TryGetValue(documentId, out var job) && (checkId is null || checkId == job.Id)
                ? job.Snapshot()
                : null;
        }
    }

    internal void Forget(Guid documentId)
    {
        lock (gate)
            jobs.Remove(documentId);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var job in queue.Reader.ReadAllAsync(stoppingToken))
        {
            lock (gate)
            {
                if (!jobs.TryGetValue(job.DocumentId, out var current) || current != job)
                    continue;
                job.Status = "running";
            }

            try
            {
                await RunAsync(job, stoppingToken);
                lock (gate)
                    job.Status = "completed";
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception error)
            {
                logger.LogWarning("Proofreading {CheckId} could not open the document ({ErrorType}).",
                    job.Id, error.GetType().Name);
                lock (gate)
                {
                    job.Status = "failed";
                    job.Message = error is DocumentNotFoundException ? error.Message : "校正対象のPDFを開けませんでした。";
                }
            }
        }
    }

    private async Task RunAsync(CheckJob job, CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var documents = scope.ServiceProvider.GetRequiredService<DocumentService>();
        var reader = scope.ServiceProvider.GetRequiredService<IPdfProofreadingReader>();
        var proofreading = scope.ServiceProvider.GetRequiredService<ProofreadingService>();
        var content = await documents.OpenContentAsync(job.DocumentId, ct);
        await using var stream = content.Stream;
        using var pdf = reader.Open(stream);

        for (var number = job.FirstPage; number <= job.LastPage; number++)
        {
            ct.ThrowIfCancellationRequested();
            lock (gate)
            {
                if (!jobs.TryGetValue(job.DocumentId, out var current) || current != job)
                    return;
                job.CurrentPage = number;
            }
            ProofreadingPage page;
            try
            {
                page = await proofreading.CheckPageAsync(number, pdf.ReadPage(number), ct);
            }
            catch (ProofreadingModelException error)
            {
                page = new(number, "failed", [], error.Message);
            }
            catch (Exception error) when (!ct.IsCancellationRequested)
            {
                logger.LogWarning("Proofreading {CheckId} could not process page {PageNumber} ({ErrorType}).",
                    job.Id, number, error.GetType().Name);
                page = new(number, "failed", [], "このページを校正できませんでした。");
            }
            lock (gate)
            {
                job.Pages.Add(page);
                job.CurrentPage = null;
            }
        }
    }

    internal enum StartResult { Accepted, AlreadyRunning, QueueFull }

    private sealed class CheckJob(Guid documentId, int firstPage, int lastPage)
    {
        public Guid Id { get; } = Guid.NewGuid();
        public Guid DocumentId { get; } = documentId;
        public int FirstPage { get; } = firstPage;
        public int LastPage { get; } = lastPage;
        public DateTime CreatedAt { get; } = DateTime.UtcNow;
        public List<ProofreadingPage> Pages { get; } = [];
        public int? CurrentPage { get; set; }
        public string Status { get; set; } = "queued";
        public string? Message { get; set; }
        public bool IsActive => Status is "queued" or "running";

        public CheckSnapshot Snapshot() => new(Id, Status, FirstPage, LastPage, LastPage - FirstPage + 1,
            Pages.Count, CurrentPage, Pages.ToArray(), Message);
    }
}

internal sealed record CheckSnapshot(Guid Id, string Status, int FirstPage, int LastPage, int TotalPages,
    int ProcessedPages, int? CurrentPage, IReadOnlyList<ProofreadingPage> Pages, string? Message);
