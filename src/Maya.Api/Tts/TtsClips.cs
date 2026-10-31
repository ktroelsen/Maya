namespace Maya.Api.Tts;

// One sentence of Google audio: from the cache when we have it, otherwise from Google within
// the daily limit (and then cached). Shared by the single-sentence endpoint and the stream.
public class TtsClips(GoogleTts google, TtsCache cache, TtsUsage usage)
{
    /// <summary>Only voices Google actually offers for Danish (also keeps the cache key sane).</summary>
    public async Task<bool> IsVoiceAsync(string? voice, CancellationToken ct) =>
        voice is not null && (await google.VoicesAsync(ct)).Any(v => v.Id == voice);

    /// <exception cref="TtsLimitException">Today's character limit is used up.</exception>
    public async Task<byte[]> GetAsync(string text, string voice, CancellationToken ct)
    {
        var key = TtsCache.Key(voice, text);
        if (await cache.GetAsync(key, ct) is { } cached) return cached;
        if (!usage.TryUse(text.Length)) throw new TtsLimitException(usage.LimitMessage);

        var audio = await google.SynthesizeAsync(text, voice, ct);
        await cache.SaveAsync(key, audio, CancellationToken.None);
        return audio;
    }
}

public class TtsLimitException(string message) : Exception(message);
