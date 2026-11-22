using Microsoft.AspNetCore.Mvc;
using PdfHighlightDemo.Business;

namespace PdfHighlightDemo.Api;

[ApiController]
[Route("api/documents/{documentId:guid}/proofreading")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class ProofreadingController(DocumentService documents, IProofreadingModel model, ProofreadingJobs jobs) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Start(Guid documentId, StartProofreading request, CancellationToken ct)
    {
        var document = await documents.GetDocumentAsync(documentId, ct);
        var firstPage = request.Scope switch
        {
            "all" when request.PageNumber is null => 1,
            "page" when request.PageNumber is >= 1 && request.PageNumber <= document.PageCount => request.PageNumber.Value,
            _ => throw new InvalidInputException("対象に全ページ、またはPDF内の1ページを指定してください。")
        };

        if (!model.IsConfigured)
            return Problem(title: "LLM APIの接続先とモデルを設定してください。",
                statusCode: StatusCodes.Status503ServiceUnavailable);

        var lastPage = request.Scope == "all" ? document.PageCount : firstPage;
        var result = jobs.TryStart(documentId, firstPage, lastPage, out var snapshot);
        return result switch
        {
            ProofreadingJobs.StartResult.Accepted => AcceptedAtAction(nameof(StatusById),
                new { documentId, checkId = snapshot!.Id }, snapshot),
            ProofreadingJobs.StartResult.AlreadyRunning => Problem(title: "このPDFの誤字チェックは実行中です。",
                statusCode: StatusCodes.Status409Conflict),
            _ => Problem(title: "チェックの待ち行列がいっぱいです。時間をおいて再試行してください。",
                statusCode: StatusCodes.Status503ServiceUnavailable)
        };
    }

    [HttpGet]
    public IActionResult Latest(Guid documentId) =>
        jobs.Find(documentId) is { } job ? Ok(job) : NoContent();

    [HttpGet("{checkId:guid}")]
    public IActionResult StatusById(Guid documentId, Guid checkId) =>
        jobs.Find(documentId, checkId) is { } job ? Ok(job) : NotFound();

    public sealed record StartProofreading(string? Scope, int? PageNumber);
}
