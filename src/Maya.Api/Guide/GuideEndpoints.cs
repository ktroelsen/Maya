using System.Text.Json;
using Maya.Api.Content;
using Maya.Api.Vision;

namespace Maya.Api.Guide;

// The shared list of the guide's answers: everyone sees everything (no login), and anyone may
// delete. Photos are served from App_Data. Importing lets a phone hand over answers it kept
// locally before they were shared.
public static class GuideEndpoints
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() },
    };

    public static void MapGuideEndpoints(this IEndpointRouteBuilder app)
    {
        var guide = app.MapGroup("/api/guide");

        guide.MapGet("/", (GuideStore store, ContentStore content) => Results.Ok(store.List(content.Topic.Id)));

        guide.MapGet("/photos/{id}", (string id, GuideStore store) =>
            store.Find(id) is { } entry && File.Exists(store.PhotoPath(entry))
                ? Results.File(store.PhotoPath(entry), entry.PhotoType, enableRangeProcessing: false)
                : Results.NotFound());

        guide.MapDelete("/{id}", (string id, GuideStore store) => store.Delete(id) ? Results.NoContent() : Results.NotFound());

        // multipart/form-data: image (file) and entry (JSON: mode, question, answer, createdAt).
        guide.MapPost("/", async (HttpRequest request, GuideStore store, ContentStore content, CancellationToken ct) =>
        {
            if (!request.HasFormContentType) return Results.BadRequest("Send billedet som en formular.");
            var form = await request.ReadFormAsync(ct);
            var file = form.Files["image"];
            if (file is null || file.Length == 0 || file.Length > VisionEndpoints.MaxImageBytes || !VisionEndpoints.IsImageType(file.ContentType))
                return Results.BadRequest("Der kom intet gyldigt billede med.");
            ImportedEntry? entry;
            try
            {
                entry = JsonSerializer.Deserialize<ImportedEntry>(form["entry"].ToString(), Json);
            }
            catch (JsonException)
            {
                entry = null;
            }
            if (entry?.Answer is not { Title: { Length: > 0 }, Answer: { Length: > 0 } } answer
                || (entry.Question?.Length ?? 0) > VisionEndpoints.MaxQuestionLength
                || answer.Answer.Length > 5000)
                return Results.BadRequest("Svaret mangler eller er ugyldigt.");

            // Only chapters that exist, as the guide itself would have answered.
            var chapters = content.Topic.Chapters
                .Where(c => answer.Chapters?.Any(a => a.Id == c.Id) == true)
                .Take(3)
                .Select(c => new VisionChapter(c.Id, c.Number, c.Title))
                .ToList();
            var createdAt = entry.CreatedAt is { } t && t <= DateTimeOffset.UtcNow ? t : DateTimeOffset.UtcNow;
            using var buffer = new MemoryStream();
            await file.CopyToAsync(buffer, ct);
            var saved = store.Save(content.Topic.Id, entry.Mode, entry.Question?.Trim() ?? "",
                answer with { Chapters = chapters }, buffer.ToArray(), file.ContentType.ToLowerInvariant(), createdAt);
            return Results.Ok(saved);
        }).RequireRateLimiting(VisionEndpoints.RateLimit).DisableAntiforgery();
    }

    record ImportedEntry(VisionMode Mode, string? Question, VisionAnswer? Answer, DateTimeOffset? CreatedAt);
}
