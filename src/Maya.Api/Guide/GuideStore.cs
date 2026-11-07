using System.Text.Json;
using Maya.Api.Vision;
using Microsoft.Extensions.Options;

namespace Maya.Api.Guide;

public class GuideOptions
{
    /// <summary>How many photos with answers are kept (all topics together); the oldest go first.</summary>
    public int MaxSaved { get; set; } = 500;
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
        foreach (var old in All().OrderByDescending(e => e.CreatedAt).Skip(options.Value.MaxSaved).ToList())
        {
            File.Delete(PhotoPath(old));
            File.Delete(Path.Combine(dir, old.Id + ".json"));
        }
    }
}
