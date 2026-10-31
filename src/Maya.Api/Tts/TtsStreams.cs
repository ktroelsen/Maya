using System.Diagnostics;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core.Features;

namespace Maya.Api.Tts;

// A text read by a Google voice as one continuous MP3 track. The phone sees a single long
// "song", so it keeps playing with the screen off; one clip per sentence would need the page
// to start new audio after every sentence, which a hidden page often isn't allowed to do.
public class TtsStream(string id, string voice, string[] texts)
{
    readonly Lock _lock = new();
    readonly List<double> _starts = [];
    bool _done;
    string? _error;

    public string Id => id;
    public string Voice => voice;
    public string[] Texts => texts;
    public DateTimeOffset LastUsed { get; set; }

    /// <summary>Where each sentence starts in the track (seconds), so far; whether it ended; why it stopped.</summary>
    public TtsStreamStatus Status()
    {
        lock (_lock) return new([.. _starts], _done, _error);
    }

    // The same id may be fetched again (a browser probing, a reconnect): it plays the same
    // track from the start, so the marks found the first time stay valid.
    internal void Restart()
    {
        lock (_lock) (_done, _error) = (false, null);
    }

    internal void Mark(int index, double start)
    {
        lock (_lock)
            if (index == _starts.Count) _starts.Add(start);
    }

    internal void Finish()
    {
        lock (_lock) _done = true;
    }

    internal void Fail(string message)
    {
        lock (_lock) _error = message;
    }
}

public record TtsStreamStatus(double[] Starts, bool Done, string? Error);

// The tracks a client has asked for, in memory: an app-pool recycle drops them, and the
// client then simply starts a new one from the sentence it got to.
public class TtsStreams(TimeProvider? clock = null)
{
    const int MaxStreams = 20;
    static readonly TimeSpan Lifetime = TimeSpan.FromHours(6);

    readonly TimeProvider _clock = clock ?? TimeProvider.System;
    readonly Dictionary<string, TtsStream> _streams = [];

    public TtsStream Create(string voice, string[] texts)
    {
        var stream = new TtsStream(Guid.NewGuid().ToString("n"), voice, texts) { LastUsed = _clock.GetUtcNow() };
        lock (_streams)
        {
            foreach (var old in _streams.Values.Where(s => _clock.GetUtcNow() - s.LastUsed > Lifetime).ToList())
                _streams.Remove(old.Id);
            while (_streams.Count >= MaxStreams)
                _streams.Remove(_streams.Values.MinBy(s => s.LastUsed)!.Id);
            _streams[stream.Id] = stream;
        }
        return stream;
    }

    public TtsStream? Get(string id)
    {
        lock (_streams)
        {
            if (!_streams.TryGetValue(id, out var stream)) return null;
            stream.LastUsed = _clock.GetUtcNow();
            return stream;
        }
    }
}

// Writes a TtsStream to the response: sentence by sentence, a couple of sentences fetched
// ahead, as plain MP3 frames one after another (no Content-Length, no ranges — like a radio
// stream). It never gets more than MaxRate × elapsed + lead seconds ahead of real time, so a
// track that is paused or abandoned doesn't get the whole text synthesized (that costs money).
public static class TtsStreamWriter
{
    const int Lookahead = 2;
    const double MaxRate = 2;   // the player's fastest speed
    const string GoogleFailed = "Google-stemmen kunne ikke læse op lige nu. Prøv igen, eller skift til enhedens stemme.";

    public static async Task WriteAsync(HttpContext ctx, TtsStream stream, TtsClips clips, int leadSeconds, ILogger log)
    {
        var ct = ctx.RequestAborted;
        var res = ctx.Response;
        res.ContentType = "audio/mpeg";
        res.Headers.CacheControl = "no-store";
        ctx.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();
        // The browser stops reading once it has buffered enough; that mustn't count as a slow client.
        if (ctx.Features.Get<IHttpMinResponseDataRateFeature>() is { } rate) rate.MinDataRate = null;

        stream.Restart();
        var pending = new Queue<Task<byte[]>>();
        var next = 0;
        var clock = Stopwatch.StartNew();
        double written = 0;
        try
        {
            for (var i = 0; i < stream.Texts.Length; i++)
            {
                while (next < stream.Texts.Length && next <= i + Lookahead)
                    pending.Enqueue(clips.GetAsync(stream.Texts[next++], stream.Voice, ct));

                byte[] audio;
                try
                {
                    audio = await pending.Dequeue();
                }
                catch (TtsLimitException ex)
                {
                    Stop(ctx, stream, ex.Message, StatusCodes.Status429TooManyRequests);
                    return;
                }
                catch (Exception ex) when (ex is TtsException or HttpRequestException)
                {
                    log.LogError(ex, "Google TTS failed while streaming");
                    Stop(ctx, stream, GoogleFailed, StatusCodes.Status502BadGateway);
                    return;
                }

                var clip = Mp3.Parse(audio);
                if (clip is null) log.LogWarning("Clip {Index} is not MP3 as expected; streaming it as is", i);
                var bytes = clip?.Audio ?? audio;
                var seconds = clip?.Seconds ?? audio.Length / 4000.0;   // ~32 kbit/s

                var wait = PacingDelay(written, clock.Elapsed, leadSeconds);
                if (wait > TimeSpan.Zero) await Task.Delay(wait, ct);

                stream.Mark(i, written);
                await res.Body.WriteAsync(bytes, ct);
                await res.Body.FlushAsync(ct);
                written += seconds;
            }
            stream.Finish();
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // The listener left (pause, seek, closed tab): stop fetching.
        }
        finally
        {
            // Clips fetched ahead that are no longer wanted may still fail; nobody is listening.
            foreach (var task in pending) _ = task.ContinueWith(static t => t.Exception, TaskContinuationOptions.OnlyOnFaulted);
        }
    }

    /// <summary>How long to hold back the next clip, so the track stays at most lead seconds ahead.</summary>
    public static TimeSpan PacingDelay(double writtenSeconds, TimeSpan elapsed, int leadSeconds) =>
        TimeSpan.FromSeconds(Math.Max(0, (writtenSeconds - leadSeconds) / MaxRate - elapsed.TotalSeconds));

    // Before any audio, an error status makes the player give up at once; later the track
    // just ends, and the client asks the status why.
    static void Stop(HttpContext ctx, TtsStream stream, string message, int status)
    {
        stream.Fail(message);
        if (ctx.Response.HasStarted) return;
        ctx.Response.StatusCode = status;
        ctx.Response.ContentType = "text/plain; charset=utf-8";
    }
}
