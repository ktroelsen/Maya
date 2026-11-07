using Microsoft.Extensions.Options;

namespace Maya.Api.Vision;

public static class VisionEndpoints
{
    public const string RateLimit = "vision";
    public const int MaxImageBytes = 8 * 1024 * 1024;
    public const int MaxQuestionLength = 500;
    static readonly string[] ImageTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

    public static bool IsImageType(string contentType) => ImageTypes.Contains(contentType.ToLowerInvariant());

    public static void MapVisionEndpoints(this IEndpointRouteBuilder app)
    {
        // multipart/form-data: image (file), mode ("object" | "sign"), question (optional).
        app.MapPost("/api/vision", async (HttpRequest request, GeminiVision gemini, VisionUsage usage, Guide.GuideStore guide, Content.ContentStore content,
            IOptions<GeminiOptions> options, ILogger<GeminiVision> log, CancellationToken ct) =>
        {
            if (!options.Value.Configured)
                return Results.Problem("Billedgenkendelsen er ikke sat op (Gemini:ApiKey mangler).", statusCode: 503);
            if (!request.HasFormContentType) return Results.BadRequest("Send billedet som en formular med et billede.");

            var form = await request.ReadFormAsync(ct);
            var file = form.Files["image"];
            if (file is null || file.Length == 0) return Results.BadRequest("Der kom intet billede med.");
            if (file.Length > MaxImageBytes) return Results.BadRequest("Billedet er for stort (højst 8 MB).");
            var type = file.ContentType.ToLowerInvariant();
            if (!ImageTypes.Contains(type)) return Results.BadRequest("Det er ikke et billede, appen kan læse.");
            var question = form["question"].ToString();
            if (question.Length > MaxQuestionLength) return Results.BadRequest($"Spørgsmålet må højst være {MaxQuestionLength} tegn.");
            var mode = form["mode"].ToString() == "sign" ? VisionMode.Sign : VisionMode.Object;

            if (!usage.TryUse())
                return Results.Problem("Dagens grænse for billedspørgsmål er nået. Prøv igen i morgen.", statusCode: 429);

            using var buffer = new MemoryStream();
            await file.CopyToAsync(buffer, ct);
            try
            {
                var photo = buffer.ToArray();
                var answer = await gemini.AskAsync(photo, type, mode, question, ct);
                // Shared with everyone: the photo and the answer are kept on the server.
                return Results.Ok(guide.Save(content.Topic.Id, mode, question.Trim(), answer, photo, type));
            }
            catch (Exception ex) when (ex is VisionException or HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
            {
                log.LogError(ex, "Gemini vision failed");
                return Results.Problem("Billedet kunne ikke genkendes lige nu. Prøv igen om lidt.", statusCode: 502);
            }
        }).RequireRateLimiting(RateLimit).DisableAntiforgery();
    }
}
