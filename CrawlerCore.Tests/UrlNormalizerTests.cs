using CrawlerCore;
using Xunit;

namespace CrawlerCore.Tests;

public class UrlNormalizerTests
{
    [Fact]
    public void NormalizesAndDropsTracking()
    {
        var settings = new CrawlSettings { DropTrackingParameters = true };
        var normalizer = new UrlNormalizer();
        var ok = normalizer.TryNormalize("https://example.com/watch?v=1&utm_source=test", "https://example.com", settings, out var uri);

        Assert.True(ok);
        Assert.Equal("https://example.com/watch?v=1", uri.ToString());
    }

    [Fact]
    public void ScopeChecksSameHost()
    {
        var settings = new CrawlSettings { SameHostOnly = true };
        var normalizer = new UrlNormalizer();
        var baseUri = new Uri("https://example.com");
        var target = new Uri("https://cdn.example.com/page");

        Assert.False(normalizer.IsInScope(target, baseUri, settings));
    }
}
