using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using PdfHighlightDemo.Business;

namespace PdfHighlightDemo.Api;

[ApiController]
[Route("api/documents")]
public sealed class DocumentsController(DocumentService documents, ProofreadingJobs proofreading) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<DocumentInfo>> List(CancellationToken ct) => documents.ListDocumentsAsync(ct);

    [HttpPost]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<DocumentInfo>> Upload([FromForm] IFormFile? file, CancellationToken ct)
    {
        if (file is null)
            return Problem(title: "PDFファイルを選択してください。", statusCode: StatusCodes.Status400BadRequest);

        await using var stream = file.OpenReadStream();
        var document = await documents.UploadAsync(file.FileName, file.Length, stream, ct);
        return CreatedAtAction(nameof(Content), new { id = document.Id }, document);
    }

    [HttpGet("{id:guid}/content")]
    [HttpHead("{id:guid}/content")]
    public async Task<IActionResult> Content(Guid id, CancellationToken ct)
    {
        var content = await documents.OpenContentAsync(id, ct);
        Response.Headers.XContentTypeOptions = "nosniff";
        Response.Headers.CacheControl = "no-cache";
        return File(content.Stream, "application/pdf", new DateTimeOffset(content.CreatedAt),
            new EntityTagHeaderValue($"\"{id:N}\""), enableRangeProcessing: true);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await documents.DeleteDocumentAsync(id, ct);
        proofreading.Forget(id);
        return NoContent();
    }

    [HttpGet("{id:guid}/highlights")]
    public Task<IReadOnlyList<HighlightInfo>> ListHighlights(Guid id, CancellationToken ct) =>
        documents.ListHighlightsAsync(id, ct);

    [HttpPost("{id:guid}/highlights")]
    public async Task<ActionResult<HighlightInfo>> AddHighlight(Guid id, NewHighlight request, CancellationToken ct)
    {
        var highlight = await documents.AddHighlightAsync(id, request, ct);
        return StatusCode(StatusCodes.Status201Created, highlight);
    }
}

[ApiController]
[Route("api/highlights")]
public sealed class HighlightsController(DocumentService documents) : ControllerBase
{
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct) =>
        await documents.DeleteHighlightAsync(id, ct) ? NoContent() : NotFound();
}
