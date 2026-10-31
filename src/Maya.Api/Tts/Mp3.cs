namespace Maya.Api.Tts;

// Just enough MP3 to glue clips into one continuous track: drop the ID3 tags and the
// Xing/Info/VBRI header frame (it states the length of that one clip, so a player could stop
// after the first sentence), and count frames to know exactly how long the clip plays.
// Only MPEG audio layer III, which is what Google sends.
public static class Mp3
{
    public record Clip(ReadOnlyMemory<byte> Audio, double Seconds);

    static readonly int[] BitratesV1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    static readonly int[] BitratesV2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    static readonly int[][] SampleRates = [[11025, 12000, 8000], [], [22050, 24000, 16000], [44100, 48000, 32000]];

    /// <summary>The playable frames of an MP3 file and their duration; null if it has none.</summary>
    public static Clip? Parse(byte[] data)
    {
        var pos = Id3v2Length(data);
        var start = pos;
        var frames = 0;
        double seconds = 0;
        while (Frame(data, pos) is { } frame)
        {
            if (frames == 0 && pos == start && IsInfoFrame(data, pos, frame.SideInfo))
                start = pos + frame.Length;   // not audio: skip it
            else
            {
                frames++;
                seconds += frame.Seconds;
            }
            pos += frame.Length;
        }
        return frames == 0 ? null : new Clip(data.AsMemory(start, pos - start), seconds);
    }

    record FrameInfo(int Length, double Seconds, int SideInfo);

    static FrameInfo? Frame(byte[] d, int pos)
    {
        if (pos + 4 > d.Length || d[pos] != 0xFF || (d[pos + 1] & 0xE0) != 0xE0) return null;
        var version = (d[pos + 1] >> 3) & 3;           // 0 = 2.5, 2 = 2, 3 = 1
        var layer = (d[pos + 1] >> 1) & 3;             // 1 = layer III
        var bitrateIndex = d[pos + 2] >> 4;
        var rateIndex = (d[pos + 2] >> 2) & 3;
        if (version == 1 || layer != 1 || bitrateIndex is 0 or 15 || rateIndex == 3) return null;

        var mpeg1 = version == 3;
        var bitrate = (mpeg1 ? BitratesV1 : BitratesV2)[bitrateIndex] * 1000;
        var sampleRate = SampleRates[version][rateIndex];
        var padding = (d[pos + 2] >> 1) & 1;
        var mono = d[pos + 3] >> 6 == 3;
        var length = (mpeg1 ? 144 : 72) * bitrate / sampleRate + padding;
        if (pos + length > d.Length) return null;      // cut-off last frame
        var samples = mpeg1 ? 1152 : 576;
        var sideInfo = mpeg1 ? (mono ? 17 : 32) : (mono ? 9 : 17);
        return new FrameInfo(length, (double)samples / sampleRate, sideInfo);
    }

    static bool IsInfoFrame(byte[] d, int pos, int sideInfo) =>
        Has(d, pos + 4 + sideInfo, "Xing") || Has(d, pos + 4 + sideInfo, "Info") || Has(d, pos + 4 + 32, "VBRI");

    static bool Has(byte[] d, int pos, string tag) =>
        pos + tag.Length <= d.Length && tag.Select((c, i) => d[pos + i] == c).All(x => x);

    // ID3v2: "ID3", version, flags, then a 28-bit "syncsafe" size (+ a 10-byte footer if flagged).
    static int Id3v2Length(byte[] d)
    {
        if (d.Length < 10 || !Has(d, 0, "ID3")) return 0;
        var size = (d[6] & 0x7F) << 21 | (d[7] & 0x7F) << 14 | (d[8] & 0x7F) << 7 | (d[9] & 0x7F);
        var footer = (d[5] & 0x10) != 0 ? 10 : 0;
        return Math.Min(d.Length, 10 + size + footer);
    }
}
