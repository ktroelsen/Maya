namespace Maya.Api.Content;

// Read-only API over the content package. The client gets the chapter list up front and one
// chapter (Markdown + metadata) at a time.
public static class ContentEndpoints
{
    public static void MapContentEndpoints(this IEndpointRouteBuilder app)
    {
        var topic = app.MapGroup("/api/topic");

        topic.MapGet("/", (ContentStore store) =>
        {
            var t = store.Topic;
            return Results.Ok(new
            {
                t.Id,
                t.Title,
                t.Subtitle,
                t.Cover,
                t.Intro,
                Chapters = t.Chapters.Select(c => new { c.Id, c.Number, c.Title, c.Summary, c.Period, Image = c.Images.FirstOrDefault()?.Src }),
                t.Podcasts,
            });
        });

        topic.MapGet("/chapters/{id}", (string id, ContentStore store) =>
        {
            var chapters = store.Topic.Chapters;
            var i = chapters.FindIndex(c => c.Id == id);
            if (i < 0) return Results.NotFound();
            var c = chapters[i];
            return Results.Ok(new
            {
                c.Id,
                c.Number,
                c.Title,
                c.Summary,
                c.Period,
                c.Places,
                c.Images,
                c.Figures,
                c.Sources,
                c.Quiz,
                c.Markdown,
                Podcasts = store.Topic.Podcasts.Where(p => p.Chapters?.Contains(c.Id) == true),
                Prev = i > 0 ? Link(chapters[i - 1]) : null,
                Next = i < chapters.Count - 1 ? Link(chapters[i + 1]) : null,
            });
        });

        foreach (var (route, file) in new[] { ("timeline", "timeline.json"), ("places", "places.geojson"), ("glossary", "glossary.json") })
        {
            topic.MapGet("/" + route, (ContentStore store) =>
                store.DataFile(file) is { } json ? Results.Text(json, "application/json") : Results.NotFound());
        }
    }

    static object Link(Chapter c) => new { c.Id, c.Number, c.Title };
}
