using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Threading.Channels;

namespace CrawlerCore;

public sealed class CrawlerEngine : IAsyncDisposable
{
    private readonly CrawlSettings _settings;
    private readonly SqliteCrawlStore _store;
    private readonly UrlNormalizer _normalizer = new();
    private readonly LinkExtractor _extractor = new();
    private readonly BloomFilter _bloom = new();
    private readonly Channel<UrlToFetch> _frontier;
    private readonly Channel<FetchResult> _fetchChannel;
    private readonly Channel<ParseResult> _parseChannel;
    private readonly Channel<(ulong UrlHash, string Html, string Url)> _enrichmentChannel;
    private readonly CancellationTokenSource _cts = new();
    private readonly HttpClient _client;
    private readonly RobotsCache _robots;
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _hostLocks = new();
    private readonly SemaphoreSlim _globalLock;
    private readonly CrawlEventBuffer _logBuffer;
    private long _queued;
    private long _fetched;
    private long _parsed;
    private long _errors;
    private long _assets;
    private DateTimeOffset _startTime;
    private Guid _runId;

    public event Action<CrawlStats>? StatsUpdated;
    public event Action<CrawlLogEntry>? LogWritten;

    public CrawlerEngine(CrawlSettings settings, SqliteCrawlStore store, CrawlEventBuffer logBuffer)
    {
        _settings = settings;
        _store = store;
        _logBuffer = logBuffer;
        _frontier = Channel.CreateBounded<UrlToFetch>(settings.FrontierCapacity);
        _fetchChannel = Channel.CreateBounded<FetchResult>(settings.FetchCapacity);
        _parseChannel = Channel.CreateBounded<ParseResult>(settings.ParseCapacity);
        _enrichmentChannel = Channel.CreateBounded<(ulong UrlHash, string Html, string Url)>(settings.ParseCapacity);
        _globalLock = new SemaphoreSlim(settings.GlobalConcurrency, settings.GlobalConcurrency);

        var handler = new SocketsHttpHandler
        {
            AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate | DecompressionMethods.Brotli,
            PooledConnectionLifetime = TimeSpan.FromMinutes(2),
            ConnectTimeout = settings.ConnectTimeout,
            MaxConnectionsPerServer = settings.PerHostConcurrency
        };

        _client = new HttpClient(handler)
        {
            Timeout = settings.ConnectTimeout + settings.ReadTimeout
        };
        _client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("CrawlerCore", "1.0"));
        _robots = new RobotsCache(_client, settings);
    }

    public async Task<CrawlRunInfo> StartAsync(string baseUrl, CancellationToken cancellationToken)
    {
        _startTime = DateTimeOffset.UtcNow;
        _runId = Guid.NewGuid();
        var run = new CrawlRunInfo(_runId, baseUrl, _startTime);
        await _store.InsertRunAsync(run);
        Log("info", $"Starting crawl {run.RunId} on {baseUrl}");

        var baseUri = new Uri(baseUrl);
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _cts.Token);
        linkedCts.CancelAfter(_settings.MaxRuntime);

        await EnqueueUrlAsync(new UrlToFetch(baseUrl, string.Empty), linkedCts.Token);

        var fetchers = Enumerable.Range(0, _settings.GlobalConcurrency).Select(_ => Task.Run(() => FetchLoopAsync(baseUri, linkedCts.Token)));
        var parsers = Enumerable.Range(0, Math.Max(1, _settings.GlobalConcurrency / 2)).Select(_ => Task.Run(() => ParseLoopAsync(baseUri, linkedCts.Token)));
        var dbWriter = Task.Run(() => DbLoopAsync(linkedCts.Token));
        var enrichmentTasks = Enumerable.Range(0, _settings.EnrichmentConcurrency).Select(_ => Task.Run(() => EnrichmentLoopAsync(linkedCts.Token)));
        var statsTask = Task.Run(() => StatsLoopAsync(linkedCts.Token));

        await Task.WhenAll(fetchers.Concat(parsers).Concat(enrichmentTasks).Append(dbWriter).Append(statsTask));
        return run;
    }

    private async Task FetchLoopAsync(Uri baseUri, CancellationToken cancellationToken)
    {
        await foreach (var item in _frontier.Reader.ReadAllAsync(cancellationToken))
        {
            if (Volatile.Read(ref _fetched) >= _settings.MaxPages)
            {
                _frontier.Writer.TryComplete();
                break;
            }

            await _globalLock.WaitAsync(cancellationToken);
            var hostLock = _hostLocks.GetOrAdd(new Uri(item.Url).Host, _ => new SemaphoreSlim(_settings.PerHostConcurrency));
            await hostLock.WaitAsync(cancellationToken);

            try
            {
                if (_settings.RespectRobots && !await _robots.IsAllowedAsync(item.Url, cancellationToken))
                {
                    Log("debug", $"Robots disallow {item.Url}");
                    continue;
                }

                var result = await FetchAsync(item, cancellationToken);
                await _fetchChannel.Writer.WriteAsync(result, cancellationToken);
            }
            catch (Exception ex)
            {
                Interlocked.Increment(ref _errors);
                Log("error", $"Fetch error {item.Url}: {ex.Message}");
            }
            finally
            {
                hostLock.Release();
                _globalLock.Release();
            }
        }
    }

    private async Task<FetchResult> FetchAsync(UrlToFetch item, CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, item.Url);
            var response = await _client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            var statusCode = (int)response.StatusCode;
            var finalUrl = response.RequestMessage?.RequestUri?.ToString() ?? item.Url;
            var contentType = response.Content.Headers.ContentType?.MediaType ?? string.Empty;
            byte[]? body = null;

            if (response.Content.Headers.ContentLength is long length && length > _settings.MaxResponseBytes)
            {
                return new FetchResult(item.Url, finalUrl, statusCode, contentType, null, item.Referrer, true, "max_size");
            }

            if (contentType.Contains("text/html", StringComparison.OrdinalIgnoreCase))
            {
                body = await response.Content.ReadAsByteArrayAsync(cancellationToken);
                if (body.Length > _settings.MaxResponseBytes)
                {
                    body = null;
                }
            }

            Interlocked.Increment(ref _fetched);
            return new FetchResult(item.Url, finalUrl, statusCode, contentType, body, item.Referrer, false, null);
        }
        catch (Exception ex)
        {
            Interlocked.Increment(ref _errors);
            return new FetchResult(item.Url, item.Url, 0, string.Empty, null, item.Referrer, true, ex.Message);
        }
    }

    private async Task ParseLoopAsync(Uri baseUri, CancellationToken cancellationToken)
    {
        await foreach (var result in _fetchChannel.Reader.ReadAllAsync(cancellationToken))
        {
            if (result.Skipped)
            {
                continue;
            }

            var parse = result.ContentType.Contains("text/html", StringComparison.OrdinalIgnoreCase)
                ? _extractor.ParseHtml(result, _normalizer, _settings, baseUri)
                : new ParseResult(result.Url, result.FinalUrl, result.StatusCode, result.ContentType, null, Array.Empty<string>(), Array.Empty<AssetRecord>(), result.Referrer);

            await _parseChannel.Writer.WriteAsync(parse, cancellationToken);

            if (_settings.EnableEnrichment && result.Body is not null)
            {
                var html = System.Text.Encoding.UTF8.GetString(result.Body);
                var urlHash = Hashing.XxHash64(parse.Url);
                await _enrichmentChannel.Writer.WriteAsync((urlHash, html, parse.Url), cancellationToken);
            }
        }
    }

    private async Task EnrichmentLoopAsync(CancellationToken cancellationToken)
    {
        await foreach (var item in _enrichmentChannel.Reader.ReadAllAsync(cancellationToken))
        {
            var metadata = _extractor.ExtractEnriched(item.Html, item.UrlHash, item.Url);
            _store.BufferMetadata(metadata);
            await _store.FlushMetadataAsync(_settings.PageBatchSize);
        }
    }

    private async Task DbLoopAsync(CancellationToken cancellationToken)
    {
        await foreach (var parse in _parseChannel.Reader.ReadAllAsync(cancellationToken))
        {
            var urlHash = Hashing.XxHash64(parse.Url);
            var page = new PageRecord(_runId, parse.Url, urlHash, parse.StatusCode, parse.ContentType, parse.Title, parse.FinalUrl, parse.Referrer);
            _store.BufferPage(page);

            foreach (var asset in parse.Assets)
            {
                var record = asset with { RunId = page.RunId, UrlHash = urlHash, Url = parse.Url };
                _store.BufferAsset(record);
                Interlocked.Add(ref _assets, 1);
            }

            foreach (var link in parse.DiscoveredLinks)
            {
                await EnqueueUrlAsync(new UrlToFetch(link, parse.Url), cancellationToken);
            }

            Interlocked.Increment(ref _parsed);

            await _store.FlushPagesAsync(_settings.PageBatchSize);
            await _store.FlushAssetsAsync(_settings.AssetBatchSize);
        }
    }

    private async Task EnqueueUrlAsync(UrlToFetch item, CancellationToken cancellationToken)
    {
        var hash = Hashing.XxHash64(item.Url);
        if (_bloom.MightContain(hash))
        {
            if (await _store.SeenAsync(hash, item.Url))
            {
                return;
            }
        }

        _bloom.Add(hash);
        await _store.MarkSeenAsync(hash, item.Url);
        await _frontier.Writer.WriteAsync(item, cancellationToken);
        Interlocked.Increment(ref _queued);
    }

    private async Task StatsLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
            var fetched = Interlocked.Read(ref _fetched);
            var now = DateTimeOffset.UtcNow;
            var minutes = (now - _startTime).TotalMinutes;
            var perMinute = minutes > 0 ? fetched / minutes : 0;
            var stats = new CrawlStats
            {
                Queued = Interlocked.Read(ref _queued),
                Fetched = fetched,
                Parsed = Interlocked.Read(ref _parsed),
                Errors = Interlocked.Read(ref _errors),
                AssetsFound = Interlocked.Read(ref _assets),
                PagesPerMinute = perMinute,
                ActiveFetchers = _settings.GlobalConcurrency
            };
            StatsUpdated?.Invoke(stats);
        }
    }

    private void Log(string level, string message)
    {
        var entry = new CrawlLogEntry(DateTimeOffset.UtcNow, level, message);
        _logBuffer.Add(level, message);
        LogWritten?.Invoke(entry);
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        _client.Dispose();
        await _store.DisposeAsync();
    }

}

public sealed class RobotsCache
{
    private readonly HttpClient _client;
    private readonly CrawlSettings _settings;
    private readonly ConcurrentDictionary<string, (DateTimeOffset Fetched, RobotsRules Rules)> _cache = new();

    public RobotsCache(HttpClient client, CrawlSettings settings)
    {
        _client = client;
        _settings = settings;
    }

    public async Task<bool> IsAllowedAsync(string url, CancellationToken cancellationToken)
    {
        var uri = new Uri(url);
        var host = uri.Host;
        var entry = _cache.GetOrAdd(host, _ => (DateTimeOffset.MinValue, new RobotsRules()));
        if (entry.Fetched == DateTimeOffset.MinValue || DateTimeOffset.UtcNow - entry.Fetched > _settings.RobotsCacheTtl)
        {
            var robotsUrl = $"{uri.Scheme}://{uri.Host}/robots.txt";
            try
            {
                var content = await _client.GetStringAsync(robotsUrl, cancellationToken);
                var rules = RobotsRules.Parse(content);
                entry = (DateTimeOffset.UtcNow, rules);
                _cache[host] = entry;
            }
            catch
            {
                entry = (DateTimeOffset.UtcNow, RobotsRules.AllowAll());
                _cache[host] = entry;
            }
        }

        return entry.Rules.IsAllowed(uri.PathAndQuery);
    }
}

public sealed class RobotsRules
{
    private readonly List<string> _disallow = new();

    public static RobotsRules Parse(string text)
    {
        var rules = new RobotsRules();
        var lines = text.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        foreach (var raw in lines)
        {
            var line = raw.Trim();
            if (line.StartsWith("Disallow:", StringComparison.OrdinalIgnoreCase))
            {
                var value = line.Substring("Disallow:".Length).Trim();
                if (!string.IsNullOrEmpty(value))
                {
                    rules._disallow.Add(value);
                }
            }
        }
        return rules;
    }

    public static RobotsRules AllowAll() => new();

    public bool IsAllowed(string path)
    {
        foreach (var disallow in _disallow)
        {
            if (path.StartsWith(disallow, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
        }
        return true;
    }
}
