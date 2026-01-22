using CrawlerCore;
using Microsoft.Data.Sqlite;
using Xunit;

namespace CrawlerCore.Tests;

public class SqliteCrawlStoreTests
{
    [Fact]
    public async Task FlushesAndQueriesFts()
    {
        var tempPath = Path.GetTempFileName();
        try
        {
            await using var store = new SqliteCrawlStore(tempPath);
            await store.InitializeAsync();
            var run = new CrawlRunInfo(Guid.NewGuid(), "https://example.com", DateTimeOffset.UtcNow);
            await store.InsertRunAsync(run);

            var url = "https://example.com/watch";
            var hash = Hashing.XxHash64(url);
            store.BufferPage(new PageRecord(run.RunId, url, hash, 200, "text/html", "Video title", url, string.Empty));
            await store.FlushPagesAsync(10);

            var metaTags = new List<MetaTagRecord>
            {
                new("og:video", "video"),
                new("twitter:player", "player")
            };
            store.BufferMetadata(new EnrichedMetadata(hash, url, "Video title", metaTags));
            await store.FlushMetadataAsync(10);

            await using var connection = new SqliteConnection($"Data Source={tempPath}");
            await connection.OpenAsync();
            var cmd = connection.CreateCommand();
            cmd.CommandText = "SELECT rowid FROM pages_fts WHERE pages_fts MATCH 'Video'";
            var result = await cmd.ExecuteScalarAsync();
            Assert.NotNull(result);

            var metaCmd = connection.CreateCommand();
            metaCmd.CommandText = "SELECT rowid FROM meta_fts WHERE meta_fts MATCH 'video'";
            var metaResult = await metaCmd.ExecuteScalarAsync();
            Assert.NotNull(metaResult);
        }
        finally
        {
            File.Delete(tempPath);
        }
    }
}
