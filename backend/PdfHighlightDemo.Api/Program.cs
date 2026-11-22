using Microsoft.AspNetCore.Http.Features;
using PdfHighlightDemo.Api;
using PdfHighlightDemo.Business;
using PdfHighlightDemo.Infrastructure;

var builder = WebApplication.CreateBuilder(args);
const long maxRequestBytes = DocumentService.MaxUploadBytes + 1024 * 1024;
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = maxRequestBytes);
builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = maxRequestBytes);
builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddScoped<DocumentService>();
builder.Services.AddDemoInfrastructure(builder.Configuration["DataDirectory"] ??
    Path.Combine(builder.Environment.ContentRootPath, "data"));

var llm = builder.Configuration.GetSection("Llm");
builder.Services.AddProofreadingInfrastructure(new ProofreadingModelOptions(
    llm["BaseUrl"], llm["Model"], llm["ApiKey"], llm.GetValue("UseJsonSchema", true),
    llm.GetValue("TimeoutSeconds", 120)));
builder.Services.AddScoped<ProofreadingService>();
builder.Services.AddSingleton<ProofreadingJobs>();
builder.Services.AddHostedService(services => services.GetRequiredService<ProofreadingJobs>());

var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.MapControllers();
await app.Services.InitializeDemoDatabaseAsync();
await app.RunAsync();
