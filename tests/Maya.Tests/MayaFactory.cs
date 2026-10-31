using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Maya.Tests;

// Boots the real API (with the real content packages) against a throwaway App_Data dir.
public class MayaFactory : WebApplicationFactory<Program>
{
    readonly string _dataDir = Path.Combine(Path.GetTempPath(), "maya-tests", Guid.NewGuid().ToString("n"));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Storage:DataDir", _dataDir);
        builder.UseSetting("Tts:RequestsPerMinute", "10000");
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        try { Directory.Delete(_dataDir, recursive: true); } catch (IOException) { /* best effort */ }
    }
}
