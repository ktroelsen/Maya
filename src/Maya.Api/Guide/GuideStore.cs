using System.IO.Compression;
using System.Text.Json;
using Maya.Api.Vision;
using Microsoft.Extensions.Options;

namespace Maya.Api.Guide;

public class GuideOptions
{
    /// <summary>How many photos with answers are kept (all topics together); the oldest go first.
    /// 0 (the default): no limit.</summary>
    public int MaxSaved { get; set; }
}

/// <summary>A photo the guide answered, shared with everyone who uses the app.</summary>
public record GuideEntry(
    string Id, string Topic, DateTimeOffset CreatedAt, VisionMode Mode, string Question, VisionAnswer Answer, string PhotoType)
{
    public string Photo => $"/api/guide/photos/{Id}";
}

// The guide's answers, kept on the server for everyone (there is no login): one JSON file and
// one photo per entry under App_Data/guide, which the deploy leaves alone. Small enough to read
// on demand; a lock keeps writes and pruning apart.
public class GuideStore(string dir, IOptions<GuideOptions> options, ILogger<GuideStore> log)
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() },
    };
    static readonly Dictionary<string, string> Extensions = new()
    {
        ["image/jpeg"] = ".jpg", ["image/png"] = ".png", ["image/webp"] = ".webp", ["image/heic"] = ".heic", ["image/heif"] = ".heif",
    };
    readonly Lock _lock = new();

    public static bool ValidId(string id) => id.Length == 32 && id.All(Uri.IsHexDigit);

    public GuideEntry Save(string topic, VisionMode mode, string question, VisionAnswer answer, byte[] photo, string photoType, DateTimeOffset? createdAt = null)
    {
        var entry = new GuideEntry(Guid.NewGuid().ToString("n"), topic, createdAt ?? DateTimeOffset.UtcNow, mode, question, answer, photoType);
        lock (_lock)
        {
            Directory.CreateDirectory(dir);
            File.WriteAllBytes(PhotoPath(entry), photo);
            File.WriteAllText(Path.Combine(dir, entry.Id + ".json"), JsonSerializer.Serialize(entry, Json));
            Prune();
        }
        return entry;
    }

    /// <summary>The topic's entries, newest first.</summary>
    public List<GuideEntry> List(string topic) => [.. All().Where(e => e.Topic == topic).OrderByDescending(e => e.CreatedAt)];

    public GuideEntry? Find(string id) => ValidId(id) ? Read(Path.Combine(dir, id + ".json")) : null;

    public string PhotoPath(GuideEntry entry) => Path.Combine(dir, entry.Id + Extensions.GetValueOrDefault(entry.PhotoType, ".jpg"));

    static readonly TimeZoneInfo Local =
        TimeZoneInfo.TryFindSystemTimeZoneById("Europe/Copenhagen", out var tz) ? tz : TimeZoneInfo.Utc;

    /// <summary>The time in Denmark, where the app is used (the server may run in UTC).</summary>
    public static DateTime LocalTime(DateTimeOffset t) => TimeZoneInfo.ConvertTime(t, Local).DateTime;

    /// <summary>A file name people can recognise: "2026-11-07 14.32 Jademaske.jpg".</summary>
    public string DownloadName(GuideEntry entry)
    {
        var title = new string([.. entry.Answer.Title.Select(c => Path.GetInvalidFileNameChars().Contains(c) || "<>:\"/\\|?*".Contains(c) || char.IsControl(c) ? ' ' : c)]).Trim();
        if (title.Length > 60) title = title[..60].Trim();
        var name = $"{LocalTime(entry.CreatedAt):yyyy-MM-dd HH.mm} {title}".Trim();
        return name + Extensions.GetValueOrDefault(entry.PhotoType, ".jpg");
    }

    /// <summary>All of the topic's photos as a zip, with the answers in svar.txt. Written to a
    /// temporary file in the guide folder that is deleted when the returned stream is closed.</summary>
    public Stream Zip(string topic)
    {
        var entries = List(topic);
        Directory.CreateDirectory(dir);
        var stream = new FileStream(Path.Combine(dir, $"download-{Guid.NewGuid():n}.zip.tmp"), FileMode.CreateNew, FileAccess.ReadWrite,
            FileShare.None, 81920, FileOptions.DeleteOnClose);
        using (var zip = new System.IO.Compression.ZipArchive(stream, System.IO.Compression.ZipArchiveMode.Create, leaveOpen: true))
        {
            var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var text = new System.Text.StringBuilder();
            foreach (var entry in entries)
            {
                var photo = PhotoPath(entry);
                if (!File.Exists(photo)) continue;
                var name = DownloadName(entry);
                if (!used.Add(name)) used.Add(name = Path.GetFileNameWithoutExtension(name) + " " + entry.Id[..6] + Path.GetExtension(name));
                // Photos are compressed already.
                zip.CreateEntryFromFile(photo, name, System.IO.Compression.CompressionLevel.NoCompression);

                text.AppendLine(name);
                text.AppendLine(entry.Answer.Title);
                if (entry.Question.Length > 0) text.AppendLine($"Spørgsmål: {entry.Question}");
                if (entry.Answer.SignText is { Length: > 0 } sign) text.AppendLine().AppendLine("Teksten på skiltet:").AppendLine(sign);
                text.AppendLine().AppendLine(entry.Answer.Answer).AppendLine().AppendLine(new string('-', 40)).AppendLine();
            }
            if (text.Length > 0)
            {
                using var writer = new StreamWriter(zip.CreateEntry("svar.txt").Open(), new System.Text.UTF8Encoding(true));
                writer.Write(text.ToString().Replace("\r\n", "\n").Replace("\n", "\r\n"));   // Windows' Notepad too
            }
        }
        stream.Position = 0;
        return stream;
    }

    public bool Delete(string id)
    {
        if (Find(id) is not { } entry) return false;
        lock (_lock)
        {
            File.Delete(PhotoPath(entry));
            File.Delete(Path.Combine(dir, id + ".json"));
        }
        return true;
    }

    IEnumerable<GuideEntry> All() =>
        Directory.Exists(dir) ? Directory.EnumerateFiles(dir, "*.json").Select(Read).OfType<GuideEntry>() : [];

    GuideEntry? Read(string path)
    {
        try
        {
            return File.Exists(path) ? JsonSerializer.Deserialize<GuideEntry>(File.ReadAllText(path), Json) : null;
        }
        catch (Exception ex) when (ex is IOException or JsonException)
        {
            log.LogWarning(ex, "Could not read guide entry {Path}", path);
            return null;
        }
    }

    void Prune()
    {
        if (options.Value.MaxSaved <= 0) return;
        foreach (var old in All().OrderByDescending(e => e.CreatedAt).Skip(options.Value.MaxSaved).ToList())
        {
            File.Delete(PhotoPath(old));
            File.Delete(Path.Combine(dir, old.Id + ".json"));
        }
    }
}
