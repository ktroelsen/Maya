using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace Maya.Api.Tts;

public class TtsOptions
{
    public GoogleTtsOptions Google { get; set; } = new();
    public int DailyCharLimit { get; set; } = 300_000;  // ~5 hours of listening a day: a cost cap
    public int CacheMaxMb { get; set; } = 300;           // App_Data/tts-cache, oldest files go first
    public int StreamLeadSeconds { get; set; } = 60;     // how far a track may run ahead of the listener
    public int RequestsPerMinute { get; set; } = 30;     // per IP, for the calls that synthesize (no login)

    public bool Configured => !string.IsNullOrEmpty(Google.ApiKey);
}

public class GoogleTtsOptions
{
    public string? ApiKey { get; set; }
    public string BaseUrl { get; set; } = "https://texttospeech.googleapis.com/";  // tests point this at a fake
}

public record TtsVoice(string Id, string Name, string Gender);

// Google Cloud Text-to-Speech, Danish Chirp 3 HD voices only. The API key goes in a header
// (not the query string), so it never ends up in logs.
public class GoogleTts(HttpClient http, IOptions<TtsOptions> options, TtsVoiceList voiceList)
{
    public const string Language = "da-DK";
    const string VoicePrefix = "da-DK-Chirp3-HD-";

    public async Task<List<TtsVoice>> VoicesAsync(CancellationToken ct)
    {
        if (voiceList.Voices is { } cached) return cached;
        await voiceList.Lock.WaitAsync(ct);
        try
        {
            if (voiceList.Voices is { } again) return again;
            using var req = Request(HttpMethod.Get, $"v1/voices?languageCode={Language}");
            using var res = await http.SendAsync(req, ct);
            await EnsureSuccessAsync(res, ct);
            var body = await res.Content.ReadFromJsonAsync<VoicesResponse>(ct);
            voiceList.Voices = (body?.Voices ?? [])
                .Where(v => v.Name.StartsWith(VoicePrefix, StringComparison.Ordinal))
                .Select(v => new TtsVoice(v.Name, v.Name[VoicePrefix.Length..], v.SsmlGender switch
                {
                    "FEMALE" => "Kvinde",
                    "MALE" => "Mand",
                    _ => "Neutral",
                }))
                .OrderBy(v => v.Gender).ThenBy(v => v.Name)
                .ToList();
            return voiceList.Voices;
        }
        finally { voiceList.Lock.Release(); }
    }

    /// <summary>MP3 audio of the text, read by the given voice.</summary>
    public async Task<byte[]> SynthesizeAsync(string text, string voiceId, CancellationToken ct)
    {
        using var req = Request(HttpMethod.Post, "v1/text:synthesize");
        req.Content = JsonContent.Create(new
        {
            input = new { text },
            voice = new { languageCode = Language, name = voiceId },
            audioConfig = new { audioEncoding = "MP3" },
        });
        using var res = await http.SendAsync(req, ct);
        await EnsureSuccessAsync(res, ct);
        var body = await res.Content.ReadFromJsonAsync<SynthesizeResponse>(ct);
        if (string.IsNullOrEmpty(body?.AudioContent)) throw new TtsException("Google returnerede ingen lyd.");
        return Convert.FromBase64String(body.AudioContent);
    }

    HttpRequestMessage Request(HttpMethod method, string path)
    {
        var req = new HttpRequestMessage(method, new Uri(new Uri(options.Value.Google.BaseUrl), path));
        req.Headers.Add("x-goog-api-key", options.Value.Google.ApiKey);
        return req;
    }

    static async Task EnsureSuccessAsync(HttpResponseMessage res, CancellationToken ct)
    {
        if (res.IsSuccessStatusCode) return;
        var detail = await res.Content.ReadAsStringAsync(ct);
        throw new TtsException($"Google svarede {(int)res.StatusCode}: {detail[..Math.Min(detail.Length, 300)]}");
    }

    record VoicesResponse([property: JsonPropertyName("voices")] List<GoogleVoice>? Voices);
    record GoogleVoice(
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("ssmlGender")] string? SsmlGender);
    record SynthesizeResponse([property: JsonPropertyName("audioContent")] string? AudioContent);
}

// Google's voice list rarely changes: fetched once per app start (a failed fetch is retried
// on the next request). A singleton, while GoogleTts itself is a typed HttpClient.
public class TtsVoiceList
{
    public List<TtsVoice>? Voices { get; set; }
    public SemaphoreSlim Lock { get; } = new(1, 1);
}

public class TtsException(string message) : Exception(message);
