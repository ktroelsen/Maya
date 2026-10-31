using System.Net;
using System.Net.Http.Json;
using System.Text;
using Maya.Api.Tts;

namespace Maya.Tests;

// MP3 as Google sends it: an ID3 tag, an "Info" header frame, the audio frames and an ID3v1
// tag. MPEG-2 layer III, 24 kHz, 32 kbit/s, mono: 96-byte frames of 24 ms each.
public static class TestMp3
{
    public const double FrameSeconds = 576 / 24000.0;
    const int FrameLength = 96;

    public static byte[] File(int frames, byte fill)
    {
        var data = new List<byte>();
        data.AddRange([.. "ID3"u8, 4, 0, 0, 0, 0, 0, 10, .. new byte[10]]);
        var info = Frame(0);
        "Info"u8.CopyTo(info.AsSpan(4 + 9));   // after the mono MPEG-2 side info
        data.AddRange(info);
        for (var i = 0; i < frames; i++) data.AddRange(Frame(fill));
        data.AddRange([.. "TAG"u8, .. new byte[125]]);
        return [.. data];
    }

    public static byte[] Frame(byte fill)
    {
        var frame = new byte[FrameLength];
        Array.Fill(frame, fill);
        (frame[0], frame[1], frame[2], frame[3]) = ((byte)0xFF, (byte)0xF3, (byte)0x44, (byte)0xC0);
        return frame;
    }
}

public class Mp3Tests
{
    [Fact]
    public void Tags_and_the_info_frame_are_dropped_and_the_frames_counted()
    {
        var clip = Mp3.Parse(TestMp3.File(10, (byte)'A'))!;

        Assert.Equal(10 * 96, clip.Audio.Length);
        Assert.Equal(TestMp3.Frame((byte)'A'), clip.Audio[..96].ToArray());
        Assert.Equal(10 * TestMp3.FrameSeconds, clip.Seconds, precision: 6);
    }

    [Fact]
    public void Something_that_is_not_mp3_has_no_clip()
    {
        Assert.Null(Mp3.Parse(Encoding.UTF8.GetBytes("Hej med dig, det her er ikke lyd.")));
        Assert.Null(Mp3.Parse([]));
    }

    [Theory]
    [InlineData(30, 0, 0)]      // within the lead: no wait
    [InlineData(100, 0, 20)]    // 40 s past the lead, played at up to 2×
    [InlineData(100, 15, 5)]
    [InlineData(100, 30, 0)]
    public void Pacing_keeps_the_track_at_most_the_lead_ahead(double written, double elapsed, double wait)
    {
        Assert.Equal(TimeSpan.FromSeconds(wait), TtsStreamWriter.PacingDelay(written, TimeSpan.FromSeconds(elapsed), leadSeconds: 60));
    }
}

public class Mp3TtsFactory : TtsFactory
{
    public Mp3TtsFactory() => Google.Mp3 = true;
}

public class LimitedMp3TtsFactory : Mp3TtsFactory
{
    protected override int DailyCharLimit => 20;
}

public class PacedMp3TtsFactory : Mp3TtsFactory
{
    protected override int StreamLeadSeconds => 0;
}

public class TtsStreamTests(Mp3TtsFactory factory) : IClassFixture<Mp3TtsFactory>
{
    const string Voice = "da-DK-Chirp3-HD-Kore";

    record Created(string Id);

    static async Task<string> CreateAsync(HttpClient client, params string[] texts)
    {
        var res = await client.PostAsJsonAsync("/api/tts/stream", new { voice = Voice, texts });
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<Created>())!.Id;
    }

    [Fact]
    public async Task A_text_plays_as_one_mp3_track_with_the_sentences_in_order()
    {
        var client = factory.CreateClient();
        string[] texts = [$"Alfa {Guid.NewGuid():n}.", "Bravo.", "Charlie er længst af dem."];
        var id = await CreateAsync(client, texts);

        var res = await client.GetAsync($"/api/tts/stream/{id}", HttpCompletionOption.ResponseHeadersRead);
        Assert.Null(res.Content.Headers.ContentLength);   // a stream, like a radio station
        var audio = await res.Content.ReadAsByteArrayAsync();

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("audio/mpeg", res.Content.Headers.ContentType?.MediaType);
        // Only audio frames, A's then B's then C's: no tags or info frames between sentences.
        var fills = audio.Chunk(96).Select(f => (char)f[4]).ToArray();
        Assert.Equal(texts.SelectMany(t => Enumerable.Repeat(t[0], t.Length)), fills);
        Assert.All(audio.Chunk(96), f => Assert.Equal(0xFF, f[0]));

        var status = await client.GetFromJsonAsync<TtsStreamStatus>($"/api/tts/stream/{id}/status");
        Assert.True(status!.Done);
        Assert.Null(status.Error);
        Assert.Equal(3, status.Starts.Length);
        Assert.Equal(0, status.Starts[0]);
        Assert.Equal(texts[0].Length * TestMp3.FrameSeconds, status.Starts[1], precision: 6);
        Assert.Equal((texts[0].Length + texts[1].Length) * TestMp3.FrameSeconds, status.Starts[2], precision: 6);
    }

    [Fact]
    public async Task Playing_a_text_again_costs_nothing()
    {
        var client = factory.CreateClient();
        string[] texts = [$"Igen {Guid.NewGuid():n}.", $"Og igen {Guid.NewGuid():n}."];

        await client.GetByteArrayAsync($"/api/tts/stream/{await CreateAsync(client, texts)}");
        var before = factory.Google.Bodies.Count;
        var again = await client.GetByteArrayAsync($"/api/tts/stream/{await CreateAsync(client, texts)}");

        Assert.Equal(before, factory.Google.Bodies.Count);
        Assert.Equal((texts[0].Length + texts[1].Length) * 96, again.Length);
    }

    [Theory]
    [InlineData("da-DK-Wavenet-F", "Hej.")]
    [InlineData(Voice, "")]
    [InlineData(Voice, " ")]
    public async Task Bad_streams_are_rejected_before_google(string voice, string text)
    {
        var client = factory.CreateClient();
        var before = factory.Google.Bodies.Count;

        var res = await client.PostAsJsonAsync("/api/tts/stream", new { voice, texts = new[] { text } });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(before, factory.Google.Bodies.Count);
    }

    [Fact]
    public async Task Too_long_sentences_and_no_sentences_are_rejected()
    {
        var client = factory.CreateClient();
        var tooLong = await client.PostAsJsonAsync("/api/tts/stream", new { voice = Voice, texts = new[] { new string('a', TtsEndpoints.MaxTextLength + 1) } });
        var none = await client.PostAsJsonAsync("/api/tts/stream", new { voice = Voice, texts = Array.Empty<string>() });

        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, none.StatusCode);
    }

    [Fact]
    public async Task Unknown_streams_are_404()
    {
        var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/tts/stream/nope")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/tts/stream/nope/status")).StatusCode);
    }
}

public class TtsStreamLimitTests
{
    [Fact]
    public async Task The_daily_limit_ends_the_track_and_says_why()
    {
        using var factory = new LimitedMp3TtsFactory();
        var client = factory.CreateClient();
        var res = await client.PostAsJsonAsync("/api/tts/stream", new { voice = "da-DK-Chirp3-HD-Kore", texts = new[] { "Første sætning.", "Anden sætning." } });
        var id = (await res.Content.ReadFromJsonAsync<JsonId>())!.Id;

        var track = await client.GetAsync($"/api/tts/stream/{id}");
        var audio = await track.Content.ReadAsByteArrayAsync();
        var status = await client.GetFromJsonAsync<TtsStreamStatus>($"/api/tts/stream/{id}/status");

        Assert.Equal(HttpStatusCode.OK, track.StatusCode);           // the first sentence played
        Assert.Equal("Første sætning.".Length * 96, audio.Length);
        Assert.False(status!.Done);
        Assert.Contains("grænse", status.Error);
    }

    [Fact]
    public async Task Without_any_audio_a_failure_is_an_error_status()
    {
        using var factory = new Mp3TtsFactory();
        factory.Google.SynthesizeStatus = HttpStatusCode.Forbidden;
        var client = factory.CreateClient();
        var res = await client.PostAsJsonAsync("/api/tts/stream", new { voice = "da-DK-Chirp3-HD-Kore", texts = new[] { "Hej." } });
        var id = (await res.Content.ReadFromJsonAsync<JsonId>())!.Id;

        var track = await client.GetAsync($"/api/tts/stream/{id}");
        var status = await client.GetFromJsonAsync<TtsStreamStatus>($"/api/tts/stream/{id}/status");

        Assert.Equal(HttpStatusCode.BadGateway, track.StatusCode);
        Assert.Contains("enhedens stemme", status!.Error);
    }

    [Fact]
    public async Task A_listener_who_leaves_stops_the_synthesis()
    {
        using var factory = new PacedMp3TtsFactory();   // no lead: the track keeps pace with real time
        var client = factory.CreateClient();
        var texts = Enumerable.Range(0, 50).Select(i => $"Sætning nummer {i} i en lang tekst, som ingen hører færdig.").ToArray();
        var res = await client.PostAsJsonAsync("/api/tts/stream", new { voice = "da-DK-Chirp3-HD-Kore", texts });
        var id = (await res.Content.ReadFromJsonAsync<JsonId>())!.Id;

        using (var cts = new CancellationTokenSource())
        {
            var track = await client.GetAsync($"/api/tts/stream/{id}", HttpCompletionOption.ResponseHeadersRead, cts.Token);
            var body = await track.Content.ReadAsStreamAsync(cts.Token);
            await body.ReadExactlyAsync(new byte[96], cts.Token);   // the first sentence has started
            await cts.CancelAsync();
        }
        await Task.Delay(1500);

        Assert.InRange(factory.Google.Bodies.Count, 1, 10);
        Assert.False((await client.GetFromJsonAsync<TtsStreamStatus>($"/api/tts/stream/{id}/status"))!.Done);
    }

    record JsonId(string Id);
}
