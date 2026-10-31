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
    public string BaseUrl { get; set; } = "https://generativelanguage.googleapis.com/";  // tests point this at a fake
    public int RequestsPerMinute { get; set; } = 6;    // per IP (no login)
    public int DailyLimit { get; set; } = 300;         // questions a day in total: a cost cap

    public bool Configured => !string.IsNullOrEmpty(ApiKey);
}

/// <summary>What the visitor points the camera at: an object, or a sign/label to explain.</summary>
public enum VisionMode { Object, Sign }

public record VisionAnswer(string Title, string Answer, List<VisionChapter> Chapters);

public record VisionChapter(string Id, int Number, string Title);

// "Guide in the pocket": a photo of an object or a museum sign → Gemini recognises it and
// explains it in Danish, with the topic's chapters as background, and points to the chapters
// that tell more. The key stays on the server and goes in a header, never in the URL.
public class GeminiVision(HttpClient http, IOptions<GeminiOptions> options, ContentStore content)
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<VisionAnswer> AskAsync(byte[] image, string mimeType, VisionMode mode, string? question, CancellationToken ct)
    {
        var o = options.Value;
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
                        answer = new { type = "STRING" },
                        chapters = new { type = "ARRAY", items = new { type = "STRING" } },
                    },
                    required = new[] { "title", "answer", "chapters" },
                },
            },
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, new Uri(new Uri(o.BaseUrl), $"v1beta/models/{o.Model}:generateContent"))
        {
            Content = JsonContent.Create(body),
        };
        req.Headers.Add("x-goog-api-key", o.ApiKey);
        using var res = await http.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode)
        {
            var detail = await res.Content.ReadAsStringAsync(ct);
            throw new VisionException($"Gemini svarede {(int)res.StatusCode}: {detail[..Math.Min(detail.Length, 300)]}");
        }

        var reply = await res.Content.ReadFromJsonAsync<GenerateResponse>(Json, ct);
        var text = reply?.Candidates?.FirstOrDefault()?.Content?.Parts?.LastOrDefault(p => p.Text is not null)?.Text
            ?? throw new VisionException("Gemini returnerede intet svar.");
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
        return new VisionAnswer(raw.Title?.Trim() ?? "", raw.Answer?.Trim() ?? "", chapters);
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
        return sb.ToString();
    }

    static string UserPrompt(VisionMode mode, string? question)
    {
        var task = mode == VisionMode.Sign
            ? "Billedet viser et skilt eller en tekst. Forklar, hvad der står, og fortæl lidt mere om emnet."
            : "Billedet viser en genstand. Hvad er det, og hvad skal jeg lægge mærke til?";
        return string.IsNullOrWhiteSpace(question) ? task : $"{task}\nMit spørgsmål: {question.Trim()}";
    }

    record RawAnswer(string? Title, string? Answer, List<string>? Chapters);
    record GenerateResponse([property: JsonPropertyName("candidates")] List<Candidate>? Candidates);
    record Candidate([property: JsonPropertyName("content")] CandidateContent? Content);
    record CandidateContent([property: JsonPropertyName("parts")] List<Part>? Parts);
    record Part([property: JsonPropertyName("text")] string? Text);
}

public class VisionException(string message) : Exception(message);

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
            if (_count >= options.Value.DailyLimit) return false;
            _count++;
            return true;
        }
    }
}
