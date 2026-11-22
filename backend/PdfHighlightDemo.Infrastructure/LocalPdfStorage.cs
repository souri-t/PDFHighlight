using Microsoft.Extensions.Logging;
using PdfHighlightDemo.Business;
using UglyToad.PdfPig;

namespace PdfHighlightDemo.Infrastructure;

internal sealed class LocalPdfStorage(string directory, ILogger<LocalPdfStorage> logger) : IPdfStorage
{
    public async Task<int> SaveAsync(string key, Stream source, CancellationToken ct)
    {
        var destination = Path.Combine(directory, key);
        var temporary = destination + ".upload";
        try
        {
            await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write,
                FileShare.None, bufferSize: 81920, useAsync: true))
            {
                await source.CopyToAsync(output, ct);
            }

            var pageCount = ReadPageCount(temporary);
            ct.ThrowIfCancellationRequested();
            File.Move(temporary, destination);
            return pageCount;
        }
        finally
        {
            TryDelete(temporary);
        }
    }

    public Stream? OpenRead(string key)
    {
        try
        {
            return new FileStream(Path.Combine(directory, key), FileMode.Open, FileAccess.Read,
                FileShare.Read | FileShare.Delete, bufferSize: 81920, useAsync: true);
        }
        catch (FileNotFoundException)
        {
            return null;
        }
    }

    public void Delete(string key) => TryDelete(Path.Combine(directory, key));

    private int ReadPageCount(string path)
    {
        using var stream = File.OpenRead(path);
        try
        {
            using var pdf = PdfDocument.Open(stream);
            if (pdf.NumberOfPages > 0)
                return pdf.NumberOfPages;
        }
        catch (Exception error) when (error is not IOException and not OutOfMemoryException)
        {
            // PdfPig can surface several exception types for malformed input.
            logger.LogDebug(error, "Unable to parse uploaded PDF");
        }

        throw new InvalidInputException("PDFを読み取れません。破損やパスワード保護を確認してください。");
    }

    private void TryDelete(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            logger.LogError(error, "Unable to remove PDF storage file {FileName}", Path.GetFileName(path));
        }
    }
}
