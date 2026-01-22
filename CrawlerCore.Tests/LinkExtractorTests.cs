using CrawlerCore;
using Xunit;

namespace CrawlerCore.Tests;

public class LinkExtractorTests
{
    [Fact]
    public void ExtractsLinksAndAssets()
    {
        var html = "<html><head><title>Test</title></head><body><a href=\"/video.mp4\">Video</a><img src='https://example.com/image.jpg' /></body></html>";
        var fetch = new FetchResult("https://example.com", "https://example.com", 200, "text/html", System.Text.Encoding.UTF8.GetBytes(html), string.Empty, false, null);
        var extractor = new LinkExtractor();
        var normalizer = new UrlNormalizer();
        var settings = new CrawlSettings();

        var result = extractor.ParseHtml(fetch, normalizer, settings, new Uri("https://example.com"), true);

        Assert.Contains("https://example.com/video.mp4", result.DiscoveredLinks);
        Assert.Contains(result.Assets, asset => asset.AssetUrl.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase));
        Assert.Equal("Test", result.Title);
    }
}
