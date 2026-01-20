using CrawlerCore;
using Xunit;

namespace CrawlerCore.Tests;

public class BloomFilterTests
{
    [Fact]
    public void AddsAndDetects()
    {
        var bloom = new BloomFilter();
        var hash = Hashing.XxHash64("https://example.com");

        Assert.False(bloom.MightContain(hash));
        bloom.Add(hash);
        Assert.True(bloom.MightContain(hash));
    }
}
