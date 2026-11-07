using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Maya.Api.Content;
using Microsoft.Extensions.Options;

namespace Maya.Api.Vision;

public class GeminiOptions
{
    public string? ApiKey { get; set; }
    public string Model { get; set; } = "gemini-3.5-flash";
    /// <summary>Tried when Google says the model doesn't exist for this key (404).</summary>
    public string FallbackModel { get; set; } = "gemini-flash-latest";
    public string BaseUrl { get; set; } = "https://generativelanguage.googleapis.com/";  // tests point this at a fake
    public int RequestsPerMinute { get; set; }        // per IP; 0 (the default): no limit
    public int DailyLimit { get; set; }               // questions a day in total; 0 (the default): no limit

    public bool Configured => !string.IsNullOrEmpty(ApiKey);
}

/// <summary>What the visitor points the camera at: an object, or a sign/label to explain.</summary>
public enum VisionMode { Object, Sign }

/// <summary>The guide's answer. SignText: for a sign, its text read off the photo (in Danish).</summary>
public record VisionAnswer(string Title, string Answer, List<VisionChapter> Chapters, string? SignText = null);

public record VisionChapter(string Id, int Number, string Title);

// "Guide in the pocket": a photo of an object or a museum sign → Gemini recognises it and
// explains it in Danish, with the topic's chapters as background, and points to the chapters
// that tell more. The key stays on the server and goes in a header, never in the URL.
public class GeminiVision(HttpClient http, IOptions<GeminiOptions> options, ContentStore content)
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<VisionAnswer> AskAsync(byte[] image, string mimeType, VisionMode mode, string? question, CancellationToken ct)
    {
        var body = new
        {
            systemInstruction = new { parts = new[] { new { text = SystemPrompt() } } },
            contents = new[]
            {
                new
                {
                    parts = new object[]
                    {
                        new { inlineData = new { mimeType, data = Convert.ToBase64String(image) } },
                        new { text = UserPrompt(mode, question) },
                    },
                },
            },
            generationConfig = new
            {
                responseMimeType = "application/json",
                responseSchema = new
                {
                    type = "OBJECT",
                    properties = new
                    {
                        title = new { type = "STRING" },
                        signText = new { type = "STRING" },
                        answer = new { type = "STRING" },
                        chapters = new { type = "ARRAY", items = new { type = "STRING" } },
                    },
                    required = new[] { "title", "answer", "chapters" },
                },
            },
        };

        var reply = await GenerateAsync(body, ct);
        var text = reply.Candidates?.FirstOrDefault()?.Content?.Parts?.LastOrDefault(p => p.Text is not null && p.Thought != true)?.Text
            ?? throw new VisionException(reply.PromptFeedback?.BlockReason is { } blocked
                ? $"Gemini ville ikke svare på billedet ({blocked})."
                : $"Gemini returnerede intet svar ({reply.Candidates?.FirstOrDefault()?.FinishReason ?? "ukendt grund"}).");
        RawAnswer raw;
        try
        {
            raw = JsonSerializer.Deserialize<RawAnswer>(text, Json) ?? throw new VisionException("Tomt svar.");
        }
        catch (JsonException ex)
        {
            throw new VisionException($"Gemini svarede ikke med gyldig JSON: {ex.Message}");
        }

        // Only chapters that exist, in story order, at most three.
        var chapters = content.Topic.Chapters
            .Where(c => raw.Chapters?.Contains(c.Id) == true)
            .Take(3)
            .Select(c => new VisionChapter(c.Id, c.Number, c.Title))
            .ToList();
        var signText = mode == VisionMode.Sign && !string.IsNullOrWhiteSpace(raw.SignText) ? raw.SignText.Trim() : null;
        return new VisionAnswer(raw.Title?.Trim() ?? "", raw.Answer?.Trim() ?? "", chapters, signText);
    }

    /// <summary>A tiny text question, to see whether Gemini answers with this key and model.</summary>
    public async Task<string> CheckAsync(CancellationToken ct)
    {
        var reply = await GenerateAsync(new { contents = new[] { new { parts = new[] { new { text = "Svar kun: ok" } } } } }, ct);
        return reply.ModelUsed;
    }

    // Calls the configured model; if Google says it doesn't exist for this key, the fallback model.
    async Task<GenerateResponse> GenerateAsync(object body, CancellationToken ct)
    {
        var o = options.Value;
        try
        {
            return await GenerateAsync(o.Model, body, ct);
        }
        catch (VisionException ex) when (ex.Status == 404 && !string.IsNullOrEmpty(o.FallbackModel) && o.FallbackModel != o.Model)
        {
            return await GenerateAsync(o.FallbackModel, body, ct);
        }
    }

    async Task<GenerateResponse> GenerateAsync(string model, object body, CancellationToken ct)
    {
        var o = options.Value;
        using var req = new HttpRequestMessage(HttpMethod.Post, new Uri(new Uri(o.BaseUrl), $"v1beta/models/{model}:generateContent"))
        {
            Content = JsonContent.Create(body),
        };
        req.Headers.Add("x-goog-api-key", o.ApiKey);
        using var res = await http.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode)
        {
            var detail = await res.Content.ReadAsStringAsync(ct);
            throw VisionException.FromGoogle((int)res.StatusCode, detail, model);
        }
        var reply = await res.Content.ReadFromJsonAsync<GenerateResponse>(Json, ct) ?? new GenerateResponse(null, null);
        return reply with { ModelUsed = model };
    }

    string SystemPrompt()
    {
        var topic = content.Topic;
        var sb = new StringBuilder();
        sb.AppendLine($"Du er en kyndig og venlig guide for voksne, der bruger appen »{topic.Title}«{(topic.Subtitle is null ? "" : $" ({topic.Subtitle})")}.");
        sb.AppendLine("Brugeren tager et billede med telefonen – af en genstand, et skilt, en tekst eller en planche – og du forklarer på dansk.");
        sb.AppendLine("Regler:");
        sb.AppendLine("- Svar på dansk, i almindelig tekst uden Markdown, i 3–8 korte sætninger. Del gerne i 2–3 afsnit adskilt af en tom linje.");
        sb.AppendLine("- Sig, hvad det er, hvad det er lavet af, hvornår og hvor det er fra, og hvad det betød – så konkret som billedet tillader.");
        sb.AppendLine("- Er du usikker, så sig det ærligt (»det ligner …«). Opfind ikke museumsnumre, fundsteder eller navne, du ikke kan se eller vide.");
        sb.AppendLine("- Står der tekst på billedet (fx et skilt på dansk, engelsk eller spansk), så brug den, og oversæt eller forklar den, hvis det er relevant.");
        sb.AppendLine("- title: en kort overskrift på 2–6 ord.");
        sb.AppendLine("- chapters: id'er på 1–3 af appens kapitler nedenfor, der fortæller mere. Kun id'er fra listen.");
        sb.AppendLine();
        sb.AppendLine("Appens kapitler (id – titel – resumé – afsnit):");
        foreach (var c in topic.Chapters)
        {
            var headings = c.Markdown.Split('\n').Where(l => l.StartsWith("## ")).Select(l => l[3..].Trim());
            sb.AppendLine($"- {c.Id} – {c.Title} – {c.Summary} – {string.Join("; ", headings)}");
        }
        if (content.GuideNotes is { Length: > 0 } notes)
        {
            sb.AppendLine();
            sb.AppendLine("Særlig baggrund (brug den, når billedet passer):");
            sb.AppendLine(notes);
        }
        return sb.ToString();
    }

    static string UserPrompt(VisionMode mode, string? question)
    {
        var task = mode == VisionMode.Sign
            ? "Billedet viser et skilt eller en tekst på en udstilling.\n"
              + "signText: skriv HELE teksten på skiltet af, ordret og i den rækkefølge, den læses – overskrift først, afsnit adskilt af en tom linje. "
              + "Står teksten på flere sprog, så brug den danske; findes der ingen dansk, så oversæt til dansk. Udelad intet, og tilføj intet. "
              + "Kan noget ikke læses, så skriv […].\n"
              + "answer: 2–4 korte sætninger, der forklarer eller sætter teksten i sammenhæng – ikke en gentagelse af den."
            : "Billedet viser en genstand. Hvad er det, og hvad skal jeg lægge mærke til? signText: lad den være tom.";
        return string.IsNullOrWhiteSpace(question) ? task : $"{task}\nMit spørgsmål: {question.Trim()}";
    }

    record RawAnswer(string? Title, string? Answer, List<string>? Chapters, string? SignText);
    record GenerateResponse(
        [property: JsonPropertyName("candidates")] List<Candidate>? Candidates,
        [property: JsonPropertyName("promptFeedback")] PromptFeedback? PromptFeedback)
    {
        [JsonIgnore] public string ModelUsed { get; init; } = "";
    }
    record PromptFeedback([property: JsonPropertyName("blockReason")] string? BlockReason);
    record Candidate(
        [property: JsonPropertyName("content")] CandidateContent? Content,
        [property: JsonPropertyName("finishReason")] string? FinishReason);
    record CandidateContent([property: JsonPropertyName("parts")] List<Part>? Parts);
    record Part([property: JsonPropertyName("text")] string? Text, [property: JsonPropertyName("thought")] bool? Thought);
}

public class VisionException(string message, int status = 0) : Exception(message)
{
    /// <summary>Google's HTTP status, when the error came from Google.</summary>
    public int Status => status;

    // Google's error, put into words a visitor (or the person fixing it) can act on. Google's own
    // message never contains the key.
    public static VisionException FromGoogle(int status, string body, string model)
    {
        string? message = null, reason = null;
        try
        {
            var error = JsonDocument.Parse(body).RootElement.GetProperty("error");
            message = error.TryGetProperty("message", out var m) ? m.GetString() : null;
            reason = error.TryGetProperty("status", out var r) ? r.GetString() : null;
        }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException)
        {
        }
        var said = message is { Length: > 0 } ? message[..Math.Min(message.Length, 200)] : $"HTTP {status}";
        var text = status switch
        {
            429 => "Gemini-kvoten eller udgiftsloftet er brugt op. Tjek udgiftsloftet i Google Cloud, eller prøv igen senere.",
            400 when said.Contains("API key", StringComparison.OrdinalIgnoreCase) => "Gemini-nøglen på serveren er ugyldig (GEMINI_API_KEY).",
            401 or 403 => $"Gemini-nøglen på serveren har ikke adgang: {said}",
            404 => $"Gemini-modellen {model} findes ikke for nøglen: {said}",
            >= 500 => $"Gemini har problemer lige nu ({status}). Prøv igen om lidt.",
            _ => $"Gemini svarede {status}{(reason is null ? "" : $" {reason}")}: {said}",
        };
        return new VisionException(text, status);
    }
}

// Questions asked today, in memory (an app-pool recycle resets it): a cost cap.
public class VisionUsage(IOptions<GeminiOptions> options, TimeProvider? clock = null)
{
    readonly Lock _lock = new();
    readonly TimeProvider _clock = clock ?? TimeProvider.System;
    DateOnly _day;
    int _count;

    public bool TryUse()
    {
        lock (_lock)
        {
            var today = DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime);
            if (today != _day) (_day, _count) = (today, 0);
            if (options.Value.DailyLimit > 0 && _count >= options.Value.DailyLimit) return false;
            _count++;
            return true;
        }
    }
}
