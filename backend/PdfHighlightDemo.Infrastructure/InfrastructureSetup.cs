using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using PdfHighlightDemo.Business;

namespace PdfHighlightDemo.Infrastructure;

public static class InfrastructureSetup
{
    public static IServiceCollection AddDemoInfrastructure(this IServiceCollection services, string dataDirectory)
    {
        var root = Path.GetFullPath(dataDirectory);
        var pdfDirectory = Path.Combine(root, "pdfs");
        Directory.CreateDirectory(pdfDirectory);

        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = Path.Combine(root, "pdf-highlight.db"),
            ForeignKeys = true
        }.ToString();

        services.AddDbContext<DemoDbContext>(options => options.UseSqlite(connectionString));
        services.AddScoped<IDemoRepository, DemoRepository>();
        services.AddSingleton<IPdfStorage>(provider =>
            new LocalPdfStorage(pdfDirectory, provider.GetRequiredService<ILogger<LocalPdfStorage>>()));
        return services;
    }

    public static IServiceCollection AddProofreadingInfrastructure(this IServiceCollection services,
        ProofreadingModelOptions options)
    {
        services.AddSingleton<IPdfProofreadingReader, PdfProofreadingReader>();
        services.AddSingleton<IProofreadingModel>(_ => new OpenAiProofreadingModel(options));
        return services;
    }

    public static async Task InitializeDemoDatabaseAsync(this IServiceProvider services)
    {
        await using var scope = services.CreateAsyncScope();
        var database = scope.ServiceProvider.GetRequiredService<DemoDbContext>();
        await database.Database.EnsureCreatedAsync();
    }
}
