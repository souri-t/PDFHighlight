using BlazorFrontend;
using BlazorFrontend.Services;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using MudBlazor.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.Services.AddScoped(_ => new HttpClient
{
    BaseAddress = new Uri(builder.HostEnvironment.BaseAddress),
    Timeout = Timeout.InfiniteTimeSpan
});
builder.Services.AddScoped<ReviewApi>();
builder.Services.AddMudServices();
await builder.Build().RunAsync();
