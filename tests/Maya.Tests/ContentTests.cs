using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Maya.Api.Content;
using Microsoft.AspNetCore.Hosting;

namespace Maya.Tests;

public class ContentTests(MayaFactory factory) : IClassFixture<MayaFactory>
{
    [Fact]
    public async Task Topic_lists_the_written_chapters_in_order()
    {
        var topic = await factory.CreateClient().GetFromJsonAsync<JsonObject>("/api/topic");
        Assert.Equal("maya", topic!["id"]!.GetValue<string>());
        var chapters = topic["chapters"]!.AsArray();
        Assert.NotEmpty(chapters);
        Assert.Equal("01-moed-mayaerne", chapters[0]!["id"]!.GetValue<string>());
        var numbers = chapters.Select(c => c!["number"]!.GetValue<int>()).ToList();
        Assert.Equal(1, numbers[0]);
        Assert.Equal(numbers.Order(), numbers);   // numbered by their place in topic.json, gaps allowed
    }

    [Fact]
    public async Task Chapters_keep_their_number_from_topic_json()
    {
        var chapter = await factory.CreateClient().GetFromJsonAsync<JsonObject>("/api/topic/chapters/05-klassisk-tid");
        Assert.Equal(5, chapter!["number"]!.GetValue<int>());
    }

    [Fact]
    public async Task A_chapter_has_markdown_metadata_and_neighbours()
    {
        var chapter = await factory.CreateClient().GetFromJsonAsync<JsonObject>("/api/topic/chapters/01-moed-mayaerne");
        Assert.Equal("Mød mayaerne", chapter!["title"]!.GetValue<string>());
        Assert.Contains("## Et folk, ikke et rige", chapter["markdown"]!.GetValue<string>());
        Assert.DoesNotContain("---", chapter["markdown"]!.GetValue<string>()[..10]);
        Assert.Equal(-2000, chapter["period"]!["from"]!.GetValue<int>());
        Assert.NotEmpty(chapter["quiz"]!.AsArray());
        Assert.Null(chapter["prev"]);
        Assert.NotNull(chapter["next"]);
    }

    [Fact]
    public async Task Unknown_chapter_is_404()
    {
        var res = await factory.CreateClient().GetAsync("/api/topic/chapters/findes-ikke");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Theory]
    [InlineData("timeline")]
    [InlineData("places")]
    [InlineData("glossary")]
    public async Task Data_files_are_served_as_json(string name)
    {
        var res = await factory.CreateClient().GetAsync($"/api/topic/{name}");
        res.EnsureSuccessStatusCode();
        Assert.Equal("application/json", res.Content.Headers.ContentType!.MediaType);
        Assert.NotNull(JsonNode.Parse(await res.Content.ReadAsStringAsync()));
    }

    [Fact]
    public async Task Media_is_served_and_missing_media_is_404()
    {
        var client = factory.CreateClient();
        var img = await client.GetAsync("/media/stil/tempel1-codex-stilark.webp");
        img.EnsureSuccessStatusCode();
        Assert.Equal("image/webp", img.Content.Headers.ContentType!.MediaType);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/media/findes-ikke.webp")).StatusCode);
    }

    [Fact]
    public async Task Every_chapter_image_exists()
    {
        var store = (ContentStore)factory.Services.GetService(typeof(ContentStore))!;
        foreach (var image in store.Topic.Chapters.SelectMany(c => c.Images))
            Assert.True(File.Exists(Path.Combine(store.MediaDir, image.Src)), $"Missing media: {image.Src}");
    }

    [Fact]
    public void Front_matter_is_split_from_the_markdown()
    {
        var (meta, body) = ContentStore.Split("---\r\ntitle: X\r\n---\r\n# Overskrift\r\n");
        Assert.Equal("title: X", meta);
        Assert.Equal("# Overskrift\n", body);
        Assert.Equal(("", "Ingen front-matter"), ContentStore.Split("Ingen front-matter"));
    }
}

public class StrictTtsFactory : TtsFactory
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("Tts:RequestsPerMinute", "3");
    }
}

public class TtsRateLimitTests
{
    [Fact]
    public async Task Synthesis_is_rate_limited_per_client()
    {
        using var factory = new StrictTtsFactory();
        var client = factory.CreateClient();
        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 4; i++)
            statuses.Add((await client.PostAsJsonAsync("/api/tts", new { text = $"Sætning {i}.", voice = "da-DK-Chirp3-HD-Kore" })).StatusCode);
        Assert.Equal([HttpStatusCode.OK, HttpStatusCode.OK, HttpStatusCode.OK, HttpStatusCode.TooManyRequests], statuses);
        // Reading voices and stream status is not limited.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/tts/voices")).StatusCode);
    }
}
