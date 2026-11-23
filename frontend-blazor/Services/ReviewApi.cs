using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Components.Forms;

namespace BlazorFrontend.Services;

public sealed class ReviewApi(HttpClient client)
{
    public Task<List<DocumentInfo>> Documents(CancellationToken ct) => Get<List<DocumentInfo>>("api/documents", ct);
    public Task<byte[]> Pdf(Guid id, CancellationToken ct) => client.GetByteArrayAsync($"api/documents/{id}/content", ct);
    public Task<List<Highlight>> Highlights(Guid id, CancellationToken ct) => Get<List<Highlight>>($"api/documents/{id}/highlights", ct);
    public Task<Highlight> AddHighlight(Guid id, NewHighlight value, CancellationToken ct) =>
        Post<Highlight>($"api/documents/{id}/highlights", value, ct);
    public Task DeleteHighlight(Guid id, CancellationToken ct) => Delete($"api/highlights/{id}", ct);
    public Task DeleteDocument(Guid id, CancellationToken ct) => Delete($"api/documents/{id}", ct);
    public Task<DocumentInfo> UploadDocument(IBrowserFile file, CancellationToken ct) =>
        Upload<DocumentInfo>("api/documents", file, 50 * 1024 * 1024, ct);
    public Task<PdfCheck> StartCheck(Guid id, bool all, int page, CancellationToken ct) =>
        Post<PdfCheck>($"api/documents/{id}/proofreading", all ? new { scope = "all" } : (object)new { scope = "page", pageNumber = page }, ct);
    public async Task<PdfCheck?> LatestCheck(Guid id, CancellationToken ct)
    {
        using var response = await client.GetAsync($"api/documents/{id}/proofreading", ct);
        if (response.StatusCode == HttpStatusCode.NoContent) return null;
        return await Read<PdfCheck>(response, ct);
    }
    public Task<PdfCheck> CheckStatus(Guid id, Guid checkId, CancellationToken ct) =>
        Get<PdfCheck>($"api/documents/{id}/proofreading/{checkId}", ct);

    public Task<List<WorkbookInfo>> Workbooks(CancellationToken ct) => Get<List<WorkbookInfo>>("api/workbooks", ct);
    public Task<WorkbookDetails> Workbook(Guid id, CancellationToken ct) => Get<WorkbookDetails>($"api/workbooks/{id}", ct);
    public Task<WorksheetPreview> Sheet(Guid id, int number, CancellationToken ct) =>
        Get<WorksheetPreview>($"api/workbooks/{id}/sheets/{number}", ct);
    public Task<List<SavedFinding>> Findings(Guid id, CancellationToken ct) => Get<List<SavedFinding>>($"api/workbooks/{id}/findings", ct);
    public Task<SavedFinding> Adopt(Guid id, CellFinding finding, CancellationToken ct) =>
        Post<SavedFinding>($"api/workbooks/{id}/findings", finding, ct);
    public Task<WorksheetCheck> CheckSheet(Guid id, int number, int offset, CancellationToken ct) =>
        Post<WorksheetCheck>($"api/workbooks/{id}/sheets/{number}/proofreading", new { offset }, ct);
    public Task DeleteWorkbook(Guid id, CancellationToken ct) => Delete($"api/workbooks/{id}", ct);
    public Task<WorkbookInfo> UploadWorkbook(IBrowserFile file, CancellationToken ct) =>
        Upload<WorkbookInfo>("api/workbooks", file, 10 * 1024 * 1024, ct);

    private async Task<T> Get<T>(string path, CancellationToken ct)
    {
        using var response = await client.GetAsync(path, ct);
        return await Read<T>(response, ct);
    }

    private async Task<T> Post<T>(string path, object input, CancellationToken ct)
    {
        using var content = JsonContent.Create(input);
        using var response = await client.PostAsync(path, content, ct);
        return await Read<T>(response, ct);
    }

    private async Task<T> Upload<T>(string path, IBrowserFile file, int limit, CancellationToken ct)
    {
        if (file.Size > limit)
            throw new InvalidOperationException($"最大{limit / 1024 / 1024} MiBまでアップロードできます。");
        using var content = new MultipartFormDataContent();
        content.Add(new StreamContent(file.OpenReadStream(limit, ct)), "file", file.Name);
        using var response = await client.PostAsync(path, content, ct);
        return await Read<T>(response, ct);
    }

    private async Task Delete(string path, CancellationToken ct)
    {
        using var response = await client.DeleteAsync(path, ct);
        await EnsureSuccess(response, ct);
    }

    private static async Task<T> Read<T>(HttpResponseMessage response, CancellationToken ct)
    {
        await EnsureSuccess(response, ct);
        return await response.Content.ReadFromJsonAsync<T>(cancellationToken: ct)
            ?? throw new InvalidOperationException("APIからデータを取得できませんでした。");
    }

    private static async Task EnsureSuccess(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;
        string? title = null;
        try { title = (await response.Content.ReadFromJsonAsync<ApiProblem>(cancellationToken: ct))?.Title; }
        catch (System.Text.Json.JsonException) { }
        catch (NotSupportedException) { }
        throw new HttpRequestException(title ?? $"リクエストに失敗しました（HTTP {(int)response.StatusCode}）。",
            null, response.StatusCode);
    }

    private record ApiProblem(string? Title);
}
