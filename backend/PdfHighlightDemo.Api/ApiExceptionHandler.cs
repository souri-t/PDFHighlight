using Microsoft.AspNetCore.Diagnostics;
using PdfHighlightDemo.Business;

namespace PdfHighlightDemo.Api;

internal sealed class ApiExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        var status = exception switch
        {
            InvalidInputException => StatusCodes.Status400BadRequest,
            DocumentNotFoundException => StatusCodes.Status404NotFound,
            _ => 0
        };

        if (status == 0)
            return false;

        await Results.Problem(title: exception.Message, statusCode: status).ExecuteAsync(context);
        return true;
    }
}
