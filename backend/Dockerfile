FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Directory.Build.props ./
COPY PdfHighlightDemo.Api/*.csproj PdfHighlightDemo.Api/
COPY PdfHighlightDemo.Business/*.csproj PdfHighlightDemo.Business/
COPY PdfHighlightDemo.Infrastructure/*.csproj PdfHighlightDemo.Infrastructure/
RUN dotnet restore PdfHighlightDemo.Api/PdfHighlightDemo.Api.csproj
COPY . .
RUN dotnet publish PdfHighlightDemo.Api/PdfHighlightDemo.Api.csproj --no-restore -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app ./
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "PdfHighlightDemo.Api.dll"]
