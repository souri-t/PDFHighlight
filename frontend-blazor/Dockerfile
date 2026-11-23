FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
RUN dotnet workload install wasm-tools --skip-manifest-update
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
COPY frontend-blazor/BlazorFrontend.csproj frontend-blazor/
RUN dotnet restore frontend-blazor/BlazorFrontend.csproj
COPY frontend-blazor/ frontend-blazor/
RUN dotnet publish frontend-blazor/BlazorFrontend.csproj -c Release --no-restore -o /app

FROM node:22-bookworm-slim AS spreadsheet
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --omit=dev && mkdir /vendor && \
    cp node_modules/jspreadsheet-ce/dist/index.js /vendor/jspreadsheet.js && \
    cp node_modules/jspreadsheet-ce/dist/jspreadsheet.css /vendor/ && \
    cp node_modules/jspreadsheet-ce/LICENSE /vendor/jspreadsheet-LICENSE && \
    cp node_modules/jsuites/dist/jsuites.js node_modules/jsuites/dist/jsuites.css /vendor/ && \
    cp node_modules/jsuites/LICENSE /vendor/jsuites-LICENSE

FROM nginx:alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/wwwroot/ /usr/share/nginx/html/
COPY --from=spreadsheet /vendor/ /usr/share/nginx/html/vendor/
EXPOSE 8080
