using Microsoft.Extensions.Options;

namespace Maya.Api.Tts;

// The Google voice. Short texts (chat answers, voice previews) are fetched one sentence at a
// time; the reader plays a whole text as one continuous track (TtsStreams). The key stays on
// the server; cached audio is served without calling Google.
public static class TtsEndpoints
{
    public const string RateLimit = "tts";
    public const int MaxTextLength = 1000;
    public const int MaxStreamSentences = 10_000;
    public const int MaxStreamChars = 1_000_000;

    const string NotConfigured = "Google-stemmen er ikke sat op (Tts:Google:ApiKey mangler).";
    const string GoogleFailed = "Google-stemmen kunne ikke læse op lige nu. Prøv igen, eller skift til enhedens stemme.";

    public static void MapTtsEndpoints(this IEndpointRouteBuilder app)
    {
        // Open to everyone (no login): the calls that make Google synthesize are rate-limited per IP,
        // on top of the daily character cap and the cache.
        var tts = app.MapGroup("/api/tts");

        tts.MapGet("/voices", async (GoogleTts google, IOptions<TtsOptions> options, ILogger<GoogleTts> log, CancellationToken ct) =>
        {
            if (!options.Value.Configured) return Results.Problem(NotConfigured, statusCode: 503);
            try
            {
                return Results.Ok(await google.VoicesAsync(ct));
            }
            catch (Exception ex) when (ex is TtsException or HttpRequestException)
            {
                log.LogError(ex, "Listing Google voices failed");
                return Results.Problem("Kunne ikke hente Googles stemmer lige nu.", statusCode: 502);
            }
        });

        tts.MapPost("/", async (TtsRequest body, TtsClips clips, IOptions<TtsOptions> options, ILogger<GoogleTts> log, CancellationToken ct) =>
        {
            if (!options.Value.Configured) return Results.Problem(NotConfigured, statusCode: 503);
            var text = body.Text?.Trim();
            if (string.IsNullOrEmpty(text) || text.Length > MaxTextLength)
                return Results.BadRequest($"Teksten skal være 1–{MaxTextLength} tegn.");

            try
            {
                if (!await clips.IsVoiceAsync(body.Voice, ct)) return Results.BadRequest("Ukendt stemme.");
                return Results.File(await clips.GetAsync(text, body.Voice!, ct), "audio/mpeg");
            }
            catch (TtsLimitException ex)
            {
                return Results.Problem(ex.Message, statusCode: 429);
            }
            catch (Exception ex) when (ex is TtsException or HttpRequestException)
            {
                log.LogError(ex, "Google TTS failed");
                return Results.Problem(GoogleFailed, statusCode: 502);
            }
        }).RequireRateLimiting(RateLimit);

        // The client's sentences (from where the listener starts), so its indexes always match.
        tts.MapPost("/stream", async (TtsStreamRequest body, TtsClips clips, TtsStreams streams,
            IOptions<TtsOptions> options, ILogger<GoogleTts> log, CancellationToken ct) =>
        {
            if (!options.Value.Configured) return Results.Problem(NotConfigured, statusCode: 503);
            var texts = body.Texts ?? [];
            if (texts.Length is 0 or > MaxStreamSentences
                || texts.Any(t => string.IsNullOrWhiteSpace(t) || t.Length > MaxTextLength)
                || texts.Sum(t => (long)t.Length) > MaxStreamChars)
                return Results.BadRequest($"Teksten skal være 1–{MaxStreamSentences:N0} sætninger på højst {MaxTextLength} tegn.");

            try
            {
                if (!await clips.IsVoiceAsync(body.Voice, ct)) return Results.BadRequest("Ukendt stemme.");
            }
            catch (Exception ex) when (ex is TtsException or HttpRequestException)
            {
                log.LogError(ex, "Listing Google voices failed");
                return Results.Problem(GoogleFailed, statusCode: 502);
            }
            return Results.Ok(new { id = streams.Create(body.Voice!, texts).Id });
        }).RequireRateLimiting(RateLimit);

        tts.MapGet("/stream/{id}", async (string id, HttpContext ctx, TtsClips clips, TtsStreams streams,
            IOptions<TtsOptions> options, ILogger<GoogleTts> log) =>
        {
            if (streams.Get(id) is not { } stream) return Results.NotFound();
            await TtsStreamWriter.WriteAsync(ctx, stream, clips, options.Value.StreamLeadSeconds, log);
            return Results.Empty;
        });

        tts.MapGet("/stream/{id}/status", (string id, TtsStreams streams) =>
            streams.Get(id) is { } stream ? Results.Ok(stream.Status()) : Results.NotFound());
    }
}

public record TtsRequest(string? Text, string? Voice);

public record TtsStreamRequest(string? Voice, string[]? Texts);
