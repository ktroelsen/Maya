using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Maya.Api.Tts;

namespace Maya.Tests;

// Stand-in for Google Cloud Text-to-Speech: a fixed Danish voice list, and "MP3" that is
// just the text's bytes, so tests can tell which text was synthesized. With Mp3 set, it sends
// real (silent) MP3 instead: one frame per character, filled with the text's first letter.
public class FakeGoogle : HttpMessageHandler
{
    public List<HttpRequestMessage> Requests { get; } = [];
    public List<JsonObject> Bodies { get; } = [];
    public HttpStatusCode SynthesizeStatus { get; set; } = HttpStatusCode.OK;
    public bool Mp3 { get; set; }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct)
    {
        lock (Requests) Requests.Add(req);
        if (req.RequestUri!.AbsolutePath == "/v1/voices")
        {
            return Json(new
            {
                voices = new object[]
                {
                    new { languageCodes = new[] { "da-DK" }, name = "da-DK-Chirp3-HD-Kore", ssmlGender = "FEMALE" },
                    new { languageCodes = new[] { "da-DK" }, name = "da-DK-Chirp3-HD-Puck", ssmlGender = "MALE" },
                    new { languageCodes = new[] { "da-DK" }, name = "da-DK-Wavenet-F", ssmlGender = "FEMALE" },
                },
            });
        }

        var body = JsonNode.Parse(await req.Content!.ReadAsStringAsync(ct))!.AsObject();
        lock (Bodies) Bodies.Add(body);
        if (SynthesizeStatus != HttpStatusCode.OK) return new HttpResponseMessage(SynthesizeStatus) { Content = new StringContent("{}") };
        var text = body["input"]!["text"]!.GetValue<string>();
        var audio = Mp3 ? TestMp3.File(text.Length, (byte)text[0]) : Encoding.UTF8.GetBytes(text);
        return Json(new { audioContent = Convert.ToBase64String(audio) });
    }

    static HttpResponseMessage Json(object o) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(JsonSerializer.Serialize(o), Encoding.UTF8, "application/json"),
    };
}

public class TtsFactory : MayaFactory
{
    public FakeGoogle Google { get; } = new();
    protected virtual int DailyCharLimit => 300_000;
    protected virtual int StreamLeadSeconds => 60;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("Tts:Google:ApiKey", "google-test-key");
        builder.UseSetting("Tts:Google:BaseUrl", "https://tts.test/");
        builder.UseSetting("Tts:DailyCharLimit", DailyCharLimit.ToString());
        builder.UseSetting("Tts:StreamLeadSeconds", StreamLeadSeconds.ToString());
        builder.ConfigureTestServices(s => s.AddHttpClient<GoogleTts>().ConfigurePrimaryHttpMessageHandler(() => Google));
    }
}

public class LimitedTtsFactory : TtsFactory
{
    protected override int DailyCharLimit => 20;
}

public class TtsTests(TtsFactory factory) : IClassFixture<TtsFactory>
{
    static Task<HttpResponseMessage> SpeakAsync(HttpClient client, string text, string voice = "da-DK-Chirp3-HD-Kore") =>
        client.PostAsJsonAsync("/api/tts", new { text, voice });

    [Fact]
    public async Task Only_danish_chirp3_hd_voices_are_offered()
    {
        var client = factory.CreateClient();
        var voices = await client.GetFromJsonAsync<List<TtsVoice>>("/api/tts/voices");

        Assert.Equal([new("da-DK-Chirp3-HD-Kore", "Kore", "Kvinde"), new("da-DK-Chirp3-HD-Puck", "Puck", "Mand")], voices);
    }

    [Fact]
    public async Task Speech_comes_back_as_mp3_and_the_key_stays_out_of_the_url()
    {
        var client = factory.CreateClient();
        var res = await SpeakAsync(client, "Hej med dig.");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("audio/mpeg", res.Content.Headers.ContentType?.MediaType);
        Assert.Equal("Hej med dig.", Encoding.UTF8.GetString(await res.Content.ReadAsByteArrayAsync()));

        var request = factory.Google.Requests[^1];
        Assert.Equal("google-test-key", request.Headers.GetValues("x-goog-api-key").Single());
        Assert.DoesNotContain("google-test-key", request.RequestUri!.ToString());
        var body = factory.Google.Bodies[^1];
        Assert.Equal("da-DK-Chirp3-HD-Kore", body["voice"]!["name"]!.GetValue<string>());
        Assert.Equal("MP3", body["audioConfig"]!["audioEncoding"]!.GetValue<string>());
    }

    [Fact]
    public async Task The_same_sentence_is_only_paid_for_once()
    {
        var client = factory.CreateClient();
        var text = $"Cachet sætning {Guid.NewGuid():n}.";

        await SpeakAsync(client, text);
        var again = await SpeakAsync(client, text);
        await SpeakAsync(client, text, "da-DK-Chirp3-HD-Puck");   // another voice is another recording

        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal(text, Encoding.UTF8.GetString(await again.Content.ReadAsByteArrayAsync()));
        Assert.Equal(2, factory.Google.Bodies.Count(b => b["input"]!["text"]!.GetValue<string>() == text));
    }

    [Theory]
    [InlineData("Hej", "da-DK-Wavenet-F")]   // a real voice, but not one we offer
    [InlineData("Hej", "../../x")]
    [InlineData("", "da-DK-Chirp3-HD-Kore")]
    public async Task Bad_requests_never_reach_google(string text, string voice)
    {
        var client = factory.CreateClient();
        var before = factory.Google.Bodies.Count;
        var res = await SpeakAsync(client, text, voice);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(before, factory.Google.Bodies.Count);
    }

    [Fact]
    public async Task Too_long_text_is_rejected()
    {
        var client = factory.CreateClient();
        var res = await SpeakAsync(client, new string('a', TtsEndpoints.MaxTextLength + 1));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Tts_is_open_without_login()
    {
        var res = await SpeakAsync(factory.CreateClient(), "Åben for alle.");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }
}

public class TtsLimitTests
{
    [Fact]
    public async Task Daily_limit_stops_new_speech_but_not_cached_speech()
    {
        using var factory = new LimitedTtsFactory();
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/tts", new { text = "Første sætning.", voice = "da-DK-Chirp3-HD-Kore" })).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsJsonAsync("/api/tts", new { text = "Anden sætning.", voice = "da-DK-Chirp3-HD-Kore" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/tts", new { text = "Første sætning.", voice = "da-DK-Chirp3-HD-Kore" })).StatusCode);
    }

    [Fact]
    public async Task Google_failure_is_a_502_with_an_explanation()
    {
        using var factory = new TtsFactory();
        factory.Google.SynthesizeStatus = HttpStatusCode.Forbidden;
        var client = factory.CreateClient();

        var res = await client.PostAsJsonAsync("/api/tts", new { text = "Hej.", voice = "da-DK-Chirp3-HD-Kore" });
        Assert.Equal(HttpStatusCode.BadGateway, res.StatusCode);
        Assert.Contains("enhedens stemme", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Without_a_key_only_the_browser_voice_exists()
    {
        using var factory = new MayaFactory();
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/api/tts/voices")).StatusCode);
        var health = await client.GetFromJsonAsync<JsonObject>("/api/health");
        Assert.False(health!["googleVoice"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Cache_drops_the_least_recently_used_files_past_its_cap()
    {
        var dir = Path.Combine(Path.GetTempPath(), "maya-tests", Guid.NewGuid().ToString("n"));
        try
        {
            var cache = new TtsCache(dir, Options.Create(new TtsOptions { CacheMaxMb = 1 }), NullLogger<TtsCache>.Instance);
            var mp3 = new byte[400 * 1024];
            await cache.SaveAsync("a", mp3, CancellationToken.None);
            File.SetLastWriteTimeUtc(Path.Combine(dir, "a.mp3"), DateTime.UtcNow.AddMinutes(-2));
            await cache.SaveAsync("b", mp3, CancellationToken.None);
            File.SetLastWriteTimeUtc(Path.Combine(dir, "b.mp3"), DateTime.UtcNow.AddMinutes(-1));
            await cache.SaveAsync("c", mp3, CancellationToken.None);   // 1.2 MB > 1 MB: "a" goes

            Assert.Null(await cache.GetAsync("a", CancellationToken.None));
            Assert.NotNull(await cache.GetAsync("b", CancellationToken.None));
            Assert.NotNull(await cache.GetAsync("c", CancellationToken.None));
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }
}
