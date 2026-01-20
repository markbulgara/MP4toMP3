using System.Collections.Concurrent;

namespace CrawlerCore;

public sealed record CrawlSettings
{
    public int MaxPages { get; init; } = 200_000;
    public TimeSpan MaxRuntime { get; init; } = TimeSpan.FromHours(2);
    public int MaxRedirects { get; init; } = 10;
    public int MaxResponseBytes { get; init; } = 4 * 1024 * 1024;
    public int GlobalConcurrency { get; init; } = 50;
    public int PerHostConcurrency { get; init; } = 10;
    public int FrontierCapacity { get; init; } = 50_000;
    public int FetchCapacity { get; init; } = 10_000;
    public int ParseCapacity { get; init; } = 10_000;
    public int DbCapacity { get; init; } = 20_000;
    public bool RespectRobots { get; init; } = true;
    public bool SameHostOnly { get; init; } = true;
    public bool DropTrackingParameters { get; init; } = true;
    public int PageBatchSize { get; init; } = 1000;
    public int AssetBatchSize { get; init; } = 1000;
    public bool EnableEnrichment { get; init; } = true;
    public int EnrichmentConcurrency { get; init; } = 4;
    public TimeSpan ConnectTimeout { get; init; } = TimeSpan.FromSeconds(10);
    public TimeSpan ReadTimeout { get; init; } = TimeSpan.FromSeconds(20);
    public TimeSpan RobotsCacheTtl { get; init; } = TimeSpan.FromHours(1);
    public IReadOnlyList<string> SkipPathContains { get; init; } = new List<string>
    {
        "calendar",
        "session=",
        "?session",
        "&session"
    };
    public IReadOnlySet<string> AllowedSchemes { get; init; } = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "http",
        "https"
    };

    public CrawlSettings WithHighThroughputDefaults() => this with
    {
        GlobalConcurrency = 200,
        PerHostConcurrency = 30,
        MaxResponseBytes = 2 * 1024 * 1024,
        FrontierCapacity = 100_000,
        FetchCapacity = 20_000,
        ParseCapacity = 20_000,
        DbCapacity = 40_000,
        PageBatchSize = 5000,
        AssetBatchSize = 5000
    };
}

public sealed record CrawlRunInfo(Guid RunId, string BaseUrl, DateTimeOffset StartedUtc);

public sealed record CrawlStats
{
    public long Queued { get; init; }
    public long Fetched { get; init; }
    public long Parsed { get; init; }
    public long Errors { get; init; }
    public long AssetsFound { get; init; }
    public double PagesPerMinute { get; init; }
    public int ActiveFetchers { get; init; }
}

public sealed record UrlToFetch(string Url, string Referrer);

public sealed record FetchResult(
    string Url,
    string FinalUrl,
    int StatusCode,
    string ContentType,
    byte[]? Body,
    string Referrer,
    bool Skipped,
    string? Error);

public sealed record ParseResult(
    string Url,
    string FinalUrl,
    int StatusCode,
    string ContentType,
    string? Title,
    IReadOnlyList<string> DiscoveredLinks,
    IReadOnlyList<AssetRecord> Assets,
    string Referrer);

public sealed record PageRecord(
    Guid RunId,
    string Url,
    ulong UrlHash,
    int StatusCode,
    string ContentType,
    string? TitleSnippet,
    string FinalUrl,
    string Referrer);

public sealed record AssetRecord(
    Guid RunId,
    string Url,
    ulong UrlHash,
    string AssetUrl,
    string AssetType,
    string Referrer);

public sealed record EnrichedMetadata(
    ulong UrlHash,
    string Url,
    string? Title,
    string? Description,
    string? OgTitle,
    string? OgDescription,
    string? OgVideo,
    string? TwitterPlayer,
    string? H1);

public sealed record CrawlLogEntry(DateTimeOffset Timestamp, string Level, string Message);

public sealed class CrawlEventBuffer
{
    private readonly int _capacity;
    private readonly ConcurrentQueue<CrawlLogEntry> _entries = new();

    public CrawlEventBuffer(int capacity = 2000)
    {
        _capacity = capacity;
    }

    public void Add(string level, string message)
    {
        _entries.Enqueue(new CrawlLogEntry(DateTimeOffset.UtcNow, level, message));
        while (_entries.Count > _capacity && _entries.TryDequeue(out _))
        {
        }
    }

    public IReadOnlyList<CrawlLogEntry> Snapshot() => _entries.ToArray();
}
