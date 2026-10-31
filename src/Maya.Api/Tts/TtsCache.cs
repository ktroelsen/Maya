using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace Maya.Api.Tts;

// Generated audio on disk (App_Data/tts-cache), so listening to a saved text again — or the
// same chat answer — costs nothing. Keyed by a hash of voice + text; the speed is applied by
// the player, so one file serves every speed. When the folder grows past the cap, the files
// used least recently are deleted.
public class TtsCache(string dir, IOptions<TtsOptions> options, ILogger<TtsCache> log)
{
    readonly Lock _pruneLock = new();

    public static string Key(string voiceId, string text) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes($"google|{voiceId}|{text}")));

    public async Task<byte[]?> GetAsync(string key, CancellationToken ct)
    {
        var path = PathFor(key);
        if (!File.Exists(path)) return null;
        try
        {
            File.SetLastWriteTimeUtc(path, DateTime.UtcNow);   // "last used", for pruning
            return await File.ReadAllBytesAsync(path, ct);
        }
        catch (IOException)
        {
            return null;   // being pruned or written right now: just synthesize again
        }
    }

    public async Task SaveAsync(string key, byte[] audio, CancellationToken ct)
    {
        Directory.CreateDirectory(dir);
        var path = PathFor(key);
        var temp = path + "." + Guid.NewGuid().ToString("n") + ".tmp";
        await File.WriteAllBytesAsync(temp, audio, ct);
        File.Move(temp, path, overwrite: true);
        Prune();
    }

    void Prune()
    {
        var max = (long)options.Value.CacheMaxMb * 1024 * 1024;
        lock (_pruneLock)
        {
            var files = new DirectoryInfo(dir).GetFiles("*.mp3").OrderBy(f => f.LastWriteTimeUtc).ToList();
            var total = files.Sum(f => f.Length);
            foreach (var f in files)
            {
                if (total <= max) break;
                try
                {
                    total -= f.Length;
                    f.Delete();
                }
                catch (IOException ex)
                {
                    log.LogWarning(ex, "Could not prune {File}", f.Name);
                }
            }
        }
    }

    string PathFor(string key) => Path.Combine(dir, key + ".mp3");
}

// Characters sent to Google today (cache hits are free). In memory, like AiUsage: an
// app-pool recycle resets it, which is fine for a single user's cost cap.
public class TtsUsage(IOptions<TtsOptions> options, TimeProvider? clock = null)
{
    readonly Lock _lock = new();
    readonly TimeProvider _clock = clock ?? TimeProvider.System;
    DateOnly _day;
    int _chars;

    public string LimitMessage =>
        $"Dagens grænse på {options.Value.DailyCharLimit:N0} tegn med Google-stemmen er nået. Skift til enhedens stemme, eller prøv igen i morgen.";

    public bool TryUse(int chars)
    {
        lock (_lock)
        {
            var today = DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime);
            if (today != _day) (_day, _chars) = (today, 0);
            if (_chars + chars > options.Value.DailyCharLimit) return false;
            _chars += chars;
            return true;
        }
    }
}
