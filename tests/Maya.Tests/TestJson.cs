using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Maya.Tests;

// The API writes enums as strings; read them back the same way.
public static class TestJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    public static Task<T?> ReadAsync<T>(this HttpContent content) => content.ReadFromJsonAsync<T>(Options);

    public static Task<T?> GetAsync<T>(this HttpClient client, string url) => client.GetFromJsonAsync<T>(url, Options);
}
