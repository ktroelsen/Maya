using System.Reflection;
using System.Threading.RateLimiting;
using Maya.Api.Content;
using Maya.Api.Tts;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

// Everything the app writes (the TTS cache) lives under App_Data. The deploy skips App_Data
// (msdeploy -skip), so it survives redeploys on Simply. Tests point Storage:DataDir elsewhere.
var dataDir = builder.Configuration["Storage:DataDir"]
    ?? Path.Combine(builder.Environment.ContentRootPath, "App_Data");
Directory.CreateDirectory(dataDir);

// The content package (texts, timeline, map, media) – read-only, shipped with the app.
builder.Services.Configure<ContentOptions>(builder.Configuration.GetSection("Content"));
builder.Services.AddSingleton<ContentStore>();

// Google Cloud voice (Chirp 3 HD) as an alternative to the browser's own. Without
// Tts:Google:ApiKey only the browser voice is offered.
builder.Services.Configure<TtsOptions>(builder.Configuration.GetSection("Tts"));
builder.Services.AddSingleton<TtsVoiceList>();
builder.Services.AddHttpClient<GoogleTts>(c => c.Timeout = TimeSpan.FromSeconds(30));
builder.Services.AddSingleton(sp => ActivatorUtilities.CreateInstance<TtsCache>(sp, Path.Combine(dataDir, "tts-cache")));
builder.Services.AddSingleton<TtsUsage>();
builder.Services.AddTransient<TtsClips>();
builder.Services.AddSingleton<TtsStreams>();

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));

// No login: the paid calls (Google voice) are limited per IP instead.
var ttsPerMinute = builder.Configuration.GetValue("Tts:RequestsPerMinute", 30);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(TtsEndpoints.RateLimit, ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = ttsPerMinute, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();

// Serve the built React frontend from wwwroot (the deploy copies web/dist → wwwroot),
// so frontend and API share one origin in production — no proxy or CORS needed.
// sw.js/index.html/manifest must revalidate so app updates reach installed PWAs at once;
// hashed /assets never change and can be cached forever.
var staticFiles = new StaticFileOptions
{
    ContentTypeProvider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider
    {
        Mappings = { [".webmanifest"] = "application/manifest+json" },
    },
    OnPrepareResponse = ctx =>
    {
        if (ctx.File.Name is "sw.js" or "index.html" or "manifest.webmanifest")
            ctx.Context.Response.Headers.CacheControl = "no-cache";
        else if (ctx.Context.Request.Path.StartsWithSegments("/assets"))
            ctx.Context.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
    },
};
app.UseDefaultFiles();
app.UseStaticFiles(staticFiles);

// The topic's images and podcasts under /media. They change rarely; a day's cache, then revalidate.
var content = app.Services.GetRequiredService<ContentStore>();
Directory.CreateDirectory(content.MediaDir);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(content.MediaDir),
    RequestPath = "/media",
    OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "public, max-age=86400",
});

app.UseRateLimiter();

app.MapGet("/api/health", (IOptions<TtsOptions> tts) => Results.Ok(new
{
    status = "ok",
    version = typeof(Program).Assembly
        .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "dev",
    googleVoice = tts.Value.Configured,
}));

app.MapContentEndpoints();
app.MapTtsEndpoints();

// Unknown /api routes are real 404s; everything else without a file extension is a client-side
// route → index.html (missing files, e.g. under /media, are plain 404s).
app.MapFallback("/api/{**rest}", () => Results.NotFound());
app.MapFallbackToFile("index.html", staticFiles);

app.Run();

public partial class Program;
