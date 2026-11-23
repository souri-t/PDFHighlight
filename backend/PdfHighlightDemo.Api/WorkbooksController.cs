using Microsoft.AspNetCore.Mvc;
using PdfHighlightDemo.Business;

namespace PdfHighlightDemo.Api;

[ApiController]
[Route("api/workbooks")]
public sealed class WorkbooksController(WorkbookReview review, IProofreadingModel model) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<WorkbookInfo>> List(CancellationToken ct) => review.ListAsync(ct);

    [HttpPost]
    [RequestSizeLimit(WorkbookReview.MaxUploadBytes + 1024 * 1024)]
    public async Task<IActionResult> Upload([FromForm] IFormFile? file, CancellationToken ct)
    {
        if (file is null || file.Length is <= 0 or > WorkbookReview.MaxUploadBytes)
            throw new InvalidInputException("10 MiB以下のExcelファイルを選択してください。");

        using var contents = new MemoryStream((int)file.Length);
        await file.CopyToAsync(contents, ct);
        var workbook = await review.UploadAsync(file.FileName, contents.ToArray(), ct);
        return CreatedAtAction(nameof(Get), new { id = workbook.Id }, workbook);
    }

    [HttpGet("{id:guid}")]
    public Task<WorkbookDetails> Get(Guid id, CancellationToken ct) => review.GetAsync(id, ct);

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await review.DeleteAsync(id, ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/sheets/{number:int}")]
    public Task<WorksheetPreview> Sheet(Guid id, int number, CancellationToken ct) =>
        review.ReadSheetAsync(id, number, ct);

    [HttpPost("{id:guid}/sheets/{number:int}/proofreading")]
    public async Task<IActionResult> Check(Guid id, int number, [FromBody] CheckBatch batch, CancellationToken ct)
    {
        if (!model.IsConfigured)
            return Problem(title: "LLM APIの接続先とモデルを設定してください。", statusCode: 503);
        return Ok(await review.CheckAsync(id, number, batch.Offset, ct));
    }

    [HttpGet("{id:guid}/findings")]
    public Task<IReadOnlyList<SavedCellFinding>> Findings(Guid id, CancellationToken ct) =>
        review.ListFindingsAsync(id, ct);

    [HttpPost("{id:guid}/findings")]
    public Task<SavedCellFinding> Adopt(Guid id, CellFinding finding, CancellationToken ct) =>
        review.AdoptAsync(id, finding, ct);

    public sealed record CheckBatch(int Offset);
}
