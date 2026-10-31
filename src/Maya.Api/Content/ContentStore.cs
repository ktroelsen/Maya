using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace Maya.Api.Content;

public class ContentOptions
{
    /// <summary>Folder holding the content packages (one subfolder per topic). Default: content/ next to the app.</summary>
    public string? Dir { get; set; }

    /// <summary>The topic this site shows (a subfolder of Dir).</summary>
    public string Topic { get; set; } = "maya";
}

// A content package on disk: topic.json, chapters/*.md (YAML front-matter + Markdown), optional
// timeline.json / places.geojson / glossary.json, and media/. The engine knows nothing about the
// topic itself; a new topic is a new folder. Files only change on deploy, so everything is read
// once and kept in memory.
public class ContentStore
{
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    static readonly IDeserializer Yaml = new DeserializerBuilder()
        .WithNamingConvention(CamelCaseNamingConvention.Instance)
        .IgnoreUnmatchedProperties()
        .Build();

    readonly Lazy<Topic> _topic;

    public ContentStore(IOptions<ContentOptions> options)
    {
        var o = options.Value;
        var root = o.Dir ?? Path.Combine(AppContext.BaseDirectory, "content");
        TopicDir = Path.GetFullPath(Path.Combine(root, o.Topic));
        _topic = new Lazy<Topic>(Load);
    }

    public string TopicDir { get; }
    public string MediaDir => Path.Combine(TopicDir, "media");
    public Topic Topic => _topic.Value;

    /// <summary>Optional guide.md: extra background for the photo guide (e.g. the exhibition's highlights), or null.</summary>
    public string? GuideNotes => DataFile("guide.md")?.Trim();

    /// <summary>One of the optional data files (timeline.json, places.geojson, glossary.json) as raw JSON, or null.</summary>
    public string? DataFile(string name)
    {
        var path = Path.Combine(TopicDir, name);
        return File.Exists(path) ? File.ReadAllText(path) : null;
    }

    Topic Load()
    {
        var info = JsonSerializer.Deserialize<TopicFile>(File.ReadAllText(Path.Combine(TopicDir, "topic.json")), Json)
            ?? throw new InvalidDataException("topic.json is empty");
        var chapters = new List<Chapter>();
        // The number is the place in topic.json, so it stays put while chapters are still being written.
        foreach (var (id, number) in info.Chapters.Select((id, i) => (id, i + 1)))
        {
            var path = Path.Combine(TopicDir, "chapters", id + ".md");
            if (!File.Exists(path)) continue;   // listed but not written yet
            var (meta, body) = Split(File.ReadAllText(path));
            ChapterMeta front;
            try
            {
                front = string.IsNullOrWhiteSpace(meta) ? new ChapterMeta() : Yaml.Deserialize<ChapterMeta>(meta) ?? new ChapterMeta();
            }
            catch (YamlDotNet.Core.YamlException ex)
            {
                throw new InvalidDataException($"Front-matter in chapters/{id}.md is not valid YAML (line {ex.Start.Line}): {ex.Message}", ex);
            }
            chapters.Add(new Chapter(id, number, front.Title ?? id, front.Summary, front.Period,
                front.Places ?? [], front.Images ?? [], front.Sources ?? [], front.Quiz ?? [], body.Trim()));
        }
        return new Topic(info.Id, info.Title, info.Subtitle, info.Cover, info.Intro, chapters, info.Podcasts ?? []);
    }

    // "---\n<yaml>\n---\n<markdown>"; without front-matter the whole file is Markdown.
    public static (string Meta, string Body) Split(string text)
    {
        text = text.Replace("\r\n", "\n");
        if (!text.StartsWith("---\n")) return ("", text);
        var end = text.IndexOf("\n---", 4, StringComparison.Ordinal);
        if (end < 0) return ("", text);
        var bodyStart = text.IndexOf('\n', end + 4);
        return (text[4..end], bodyStart < 0 ? "" : text[(bodyStart + 1)..]);
    }

    record TopicFile(string Id, string Title, string? Subtitle, string? Cover, string? Intro, List<string> Chapters, List<Podcast>? Podcasts);
}

public record Topic(string Id, string Title, string? Subtitle, string? Cover, string? Intro, List<Chapter> Chapters, List<Podcast> Podcasts)
{
    public Chapter? Find(string id) => Chapters.FirstOrDefault(c => c.Id == id);
}

public record Podcast(string Id, string Title, string Src, string? Description, List<string>? Chapters);

public record Chapter(
    string Id, int Number, string Title, string? Summary, Period? Period, List<string> Places,
    List<Image> Images, List<Source> Sources, List<QuizQuestion> Quiz, [property: JsonIgnore] string Markdown);

// Years as numbers: negative = BCE (f.Kr.).
public class Period
{
    public int From { get; set; }
    public int To { get; set; }
    public string? Label { get; set; }
}

public class Image
{
    public string Src { get; set; } = "";
    public string? Alt { get; set; }
    public string? Caption { get; set; }
    public string? Credit { get; set; }
    /// <summary>An illustration/reconstruction, not a photo of a real object.</summary>
    public bool Illustration { get; set; }
}

public class Source
{
    public string Title { get; set; } = "";
    public string? Url { get; set; }
}

public class QuizQuestion
{
    public string Question { get; set; } = "";
    public List<string> Options { get; set; } = [];
    public int Answer { get; set; }
    public string? Explanation { get; set; }
}

class ChapterMeta
{
    public string? Title { get; set; }
    public string? Summary { get; set; }
    public Period? Period { get; set; }
    public List<string>? Places { get; set; }
    public List<Image>? Images { get; set; }
    public List<Source>? Sources { get; set; }
    public List<QuizQuestion>? Quiz { get; set; }
}
