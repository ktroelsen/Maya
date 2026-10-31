using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Maya.Api.Vision;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Maya.Tests;

// Stand-in for Gemini: answers with a fixed JSON reply and records what it was sent.
public class FakeGemini : HttpMessageHandler
{
    public List<(string Path, string? Key, JsonObject Body)> Requests { get; } = [];
    public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;
    public string ReplyJson { get; set; } =
        """{"title":"Jademaske","answer":"Det er en dødsmaske af jade.","chapters":["09-kunst-og-arkitektur","findes-ikke","14-klar-til-moesgaard"]}""";

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct)
    {
        var body = JsonNode.Parse(await req.Content!.ReadAsStringAsync(ct))!.AsObject();
        lock (Requests) Requests.Add((req.RequestUri!.AbsolutePath, req.Headers.TryGetValues("x-goog-api-key", out var k) ? k.First() : null, body));
        if (Status != HttpStatusCode.OK) return new HttpResponseMessage(Status) { Content = new StringContent("{}") };
        var reply = new { candidates = new[] { new { content = new { parts = new[] { new { text = ReplyJson } } } } } };
        return new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(reply), Encoding.UTF8, "application/json"),
        };
    }
}

public class VisionFactory : MayaFactory
{
    public FakeGemini Gemini { get; } = new();
    protected virtual int PerMinute => 1000;
    protected virtual int DailyLimit => 1000;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("Gemini:ApiKey", "gemini-test-key");
        builder.UseSetting("Gemini:BaseUrl", "https://gemini.test/");
        builder.UseSetting("Gemini:RequestsPerMinute", PerMinute.ToString());
        builder.UseSetting("Gemini:DailyLimit", DailyLimit.ToString());
        builder.ConfigureTestServices(s => s.AddHttpClient<GeminiVision>().ConfigurePrimaryHttpMessageHandler(() => Gemini));
    }
}

public class StrictVisionFactory : VisionFactory
{
    protected override int PerMinute => 2;
}

public class CappedVisionFactory : VisionFactory
{
    protected override int DailyLimit => 1;
}

public static class VisionForm
{
    public static MultipartFormDataContent Photo(string type = "image/jpeg", int bytes = 100, string? mode = null, string? question = null)
    {
        var form = new MultipartFormDataContent();
        var image = new ByteArrayContent(new byte[bytes]);
        image.Headers.ContentType = new MediaTypeHeaderValue(type);
        form.Add(image, "image", "foto.jpg");
        if (mode is not null) form.Add(new StringContent(mode), "mode");
        if (question is not null) form.Add(new StringContent(question), "question");
        return form;
    }
}

public class VisionTests(VisionFactory factory) : IClassFixture<VisionFactory>
{
    [Fact]
    public async Task A_photo_gets_a_danish_answer_with_known_chapters_only()
    {
        var res = await factory.CreateClient().PostAsync("/api/vision", VisionForm.Photo(question: "Hvem bar den?"));
        res.EnsureSuccessStatusCode();
        var answer = await res.Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal("Jademaske", answer!["title"]!.GetValue<string>());
        var chapters = answer["chapters"]!.AsArray().Select(c => c!["id"]!.GetValue<string>()).ToList();
        Assert.Equal(["09-kunst-og-arkitektur", "14-klar-til-moesgaard"], chapters);
        Assert.Equal(9, answer["chapters"]![0]!["number"]!.GetValue<int>());
    }

    [Fact]
    public async Task The_key_goes_in_a_header_and_the_prompt_carries_the_chapters_and_question()
    {
        await factory.CreateClient().PostAsync("/api/vision", VisionForm.Photo(mode: "sign", question: "Hvad betyder ordet?"));
        var (path, key, body) = factory.Gemini.Requests.Last();
        Assert.Equal("/v1beta/models/gemini-3.5-flash:generateContent", path);
        Assert.Equal("gemini-test-key", key);
        var system = body["systemInstruction"]!["parts"]![0]!["text"]!.GetValue<string>();
        Assert.Contains("05-klassisk-tid", system);
        Assert.Contains("Dzibanche", system);   // from the topic's guide.md
        var parts = body["contents"]![0]!["parts"]!.AsArray();
        Assert.Equal("image/jpeg", parts[0]!["inlineData"]!["mimeType"]!.GetValue<string>());
        var text = parts[1]!["text"]!.GetValue<string>();
        Assert.Contains("skilt", text);
        Assert.Contains("Hvad betyder ordet?", text);
    }

    [Theory]
    [InlineData("application/pdf", 100)]
    [InlineData("image/jpeg", 0)]
    [InlineData("image/jpeg", VisionEndpoints.MaxImageBytes + 1)]
    public async Task Bad_uploads_are_rejected_before_gemini(string type, int bytes)
    {
        var before = factory.Gemini.Requests.Count;
        var res = await factory.CreateClient().PostAsync("/api/vision", VisionForm.Photo(type, bytes));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(before, factory.Gemini.Requests.Count);
    }

    [Fact]
    public async Task Health_says_vision_is_available()
    {
        var health = await factory.CreateClient().GetFromJsonAsync<JsonObject>("/api/health");
        Assert.True(health!["vision"]!.GetValue<bool>());
    }
}

public class VisionLimitTests
{
    [Fact]
    public async Task Without_a_key_vision_is_off()
    {
        using var factory = new MayaFactory();
        var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.PostAsync("/api/vision", VisionForm.Photo())).StatusCode);
        var health = await client.GetFromJsonAsync<JsonObject>("/api/health");
        Assert.False(health!["vision"]!.GetValue<bool>());
    }

    [Fact]
    public async Task Gemini_failure_is_a_502_with_an_explanation()
    {
        using var factory = new VisionFactory();
        factory.Gemini.Status = HttpStatusCode.InternalServerError;
        var res = await factory.CreateClient().PostAsync("/api/vision", VisionForm.Photo());
        Assert.Equal(HttpStatusCode.BadGateway, res.StatusCode);
        Assert.Contains("Prøv igen", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Invalid_json_from_gemini_is_a_502()
    {
        using var factory = new VisionFactory();
        factory.Gemini.ReplyJson = "ikke json";
        Assert.Equal(HttpStatusCode.BadGateway, (await factory.CreateClient().PostAsync("/api/vision", VisionForm.Photo())).StatusCode);
    }

    [Fact]
    public async Task Requests_are_rate_limited_per_client()
    {
        using var factory = new StrictVisionFactory();
        var client = factory.CreateClient();
        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++) statuses.Add((await client.PostAsync("/api/vision", VisionForm.Photo())).StatusCode);
        Assert.Equal([HttpStatusCode.OK, HttpStatusCode.OK, HttpStatusCode.TooManyRequests], statuses);
    }

    [Fact]
    public async Task The_daily_limit_stops_further_questions()
    {
        using var factory = new CappedVisionFactory();
        var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/vision", VisionForm.Photo())).StatusCode);
        var res = await client.PostAsync("/api/vision", VisionForm.Photo());
        Assert.Equal(HttpStatusCode.TooManyRequests, res.StatusCode);
        Assert.Contains("Dagens grænse", await res.Content.ReadAsStringAsync());
        Assert.Single(factory.Gemini.Requests);
    }
}
