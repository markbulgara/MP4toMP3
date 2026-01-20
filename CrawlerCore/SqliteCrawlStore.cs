using Microsoft.Data.Sqlite;
using System.Collections.Concurrent;

namespace CrawlerCore;

public sealed class SqliteCrawlStore : IAsyncDisposable
{
    private readonly string _dbPath;
    private SqliteConnection? _connection;
    private readonly ConcurrentQueue<PageRecord> _pageBuffer = new();
    private readonly ConcurrentQueue<AssetRecord> _assetBuffer = new();
    private readonly ConcurrentQueue<EnrichedMetadata> _metaBuffer = new();

    public SqliteCrawlStore(string dbPath)
    {
        _dbPath = dbPath;
    }

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection($"Data Source={_dbPath}");
        await _connection.OpenAsync();

        await ExecuteNonQueryAsync(@"
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA temp_store=MEMORY;
PRAGMA cache_size=20000;
");

        await ExecuteNonQueryAsync(@"
CREATE TABLE IF NOT EXISTS crawl_runs (
    run_id TEXT PRIMARY KEY,
    base_url TEXT NOT NULL,
    started_utc TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pages (
    run_id TEXT NOT NULL,
    url TEXT NOT NULL,
    url_hash INTEGER NOT NULL,
    status_code INTEGER NOT NULL,
    content_type TEXT NOT NULL,
    title_snippet TEXT,
    final_url TEXT NOT NULL,
    referrer TEXT,
    PRIMARY KEY (run_id, url_hash)
);
CREATE TABLE IF NOT EXISTS assets (
    run_id TEXT NOT NULL,
    url_hash INTEGER NOT NULL,
    page_url TEXT NOT NULL,
    asset_url TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    referrer TEXT,
    PRIMARY KEY (run_id, url_hash, asset_url)
);
CREATE TABLE IF NOT EXISTS seen (
    url_hash INTEGER PRIMARY KEY,
    url TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS metadata (
    url_hash INTEGER PRIMARY KEY,
    url TEXT NOT NULL,
    title TEXT
);
CREATE TABLE IF NOT EXISTS meta_tags (
    url_hash INTEGER NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
    url,
    title,
    content=''
);
CREATE VIRTUAL TABLE IF NOT EXISTS meta_fts USING fts5(
    url,
    title,
    meta_name,
    meta_content,
    content=''
);
");
    }

    public async Task InsertRunAsync(CrawlRunInfo run)
    {
        var cmd = _connection!.CreateCommand();
        cmd.CommandText = "INSERT INTO crawl_runs (run_id, base_url, started_utc) VALUES ($runId, $baseUrl, $started)";
        cmd.Parameters.AddWithValue("$runId", run.RunId.ToString());
        cmd.Parameters.AddWithValue("$baseUrl", run.BaseUrl);
        cmd.Parameters.AddWithValue("$started", run.StartedUtc.ToString("O"));
        await cmd.ExecuteNonQueryAsync();
    }

    public void BufferPage(PageRecord record) => _pageBuffer.Enqueue(record);

    public void BufferAsset(AssetRecord record) => _assetBuffer.Enqueue(record);

    public void BufferMetadata(EnrichedMetadata record) => _metaBuffer.Enqueue(record);

    public async Task<int> FlushPagesAsync(int maxBatch)
    {
        if (_connection is null)
        {
            return 0;
        }

        var batch = DequeueBatch(_pageBuffer, maxBatch);
        if (batch.Count == 0)
        {
            return 0;
        }

        using var transaction = _connection.BeginTransaction();
        var cmd = _connection.CreateCommand();
        cmd.CommandText = @"INSERT OR IGNORE INTO pages (run_id, url, url_hash, status_code, content_type, title_snippet, final_url, referrer)
VALUES ($runId, $url, $hash, $status, $contentType, $title, $finalUrl, $referrer)";
        var runIdParam = cmd.CreateParameter();
        runIdParam.ParameterName = "$runId";
        cmd.Parameters.Add(runIdParam);
        var urlParam = cmd.CreateParameter();
        urlParam.ParameterName = "$url";
        cmd.Parameters.Add(urlParam);
        var hashParam = cmd.CreateParameter();
        hashParam.ParameterName = "$hash";
        cmd.Parameters.Add(hashParam);
        var statusParam = cmd.CreateParameter();
        statusParam.ParameterName = "$status";
        cmd.Parameters.Add(statusParam);
        var typeParam = cmd.CreateParameter();
        typeParam.ParameterName = "$contentType";
        cmd.Parameters.Add(typeParam);
        var titleParam = cmd.CreateParameter();
        titleParam.ParameterName = "$title";
        cmd.Parameters.Add(titleParam);
        var finalParam = cmd.CreateParameter();
        finalParam.ParameterName = "$finalUrl";
        cmd.Parameters.Add(finalParam);
        var refParam = cmd.CreateParameter();
        refParam.ParameterName = "$referrer";
        cmd.Parameters.Add(refParam);

        foreach (var record in batch)
        {
            runIdParam.Value = record.RunId.ToString();
            urlParam.Value = record.Url;
            hashParam.Value = (long)record.UrlHash;
            statusParam.Value = record.StatusCode;
            typeParam.Value = record.ContentType;
            titleParam.Value = record.TitleSnippet ?? string.Empty;
            finalParam.Value = record.FinalUrl;
            refParam.Value = record.Referrer ?? string.Empty;
            await cmd.ExecuteNonQueryAsync();
        }

        await transaction.CommitAsync();
        return batch.Count;
    }

    public async Task<int> FlushAssetsAsync(int maxBatch)
    {
        if (_connection is null)
        {
            return 0;
        }

        var batch = DequeueBatch(_assetBuffer, maxBatch);
        if (batch.Count == 0)
        {
            return 0;
        }

        using var transaction = _connection.BeginTransaction();
        var cmd = _connection.CreateCommand();
        cmd.CommandText = @"INSERT OR IGNORE INTO assets (run_id, url_hash, page_url, asset_url, asset_type, referrer)
VALUES ($runId, $hash, $pageUrl, $assetUrl, $assetType, $referrer)";
        var runIdParam = cmd.CreateParameter();
        runIdParam.ParameterName = "$runId";
        cmd.Parameters.Add(runIdParam);
        var hashParam = cmd.CreateParameter();
        hashParam.ParameterName = "$hash";
        cmd.Parameters.Add(hashParam);
        var pageParam = cmd.CreateParameter();
        pageParam.ParameterName = "$pageUrl";
        cmd.Parameters.Add(pageParam);
        var assetParam = cmd.CreateParameter();
        assetParam.ParameterName = "$assetUrl";
        cmd.Parameters.Add(assetParam);
        var typeParam = cmd.CreateParameter();
        typeParam.ParameterName = "$assetType";
        cmd.Parameters.Add(typeParam);
        var refParam = cmd.CreateParameter();
        refParam.ParameterName = "$referrer";
        cmd.Parameters.Add(refParam);

        foreach (var record in batch)
        {
            runIdParam.Value = record.RunId.ToString();
            hashParam.Value = (long)record.UrlHash;
            pageParam.Value = record.Url;
            assetParam.Value = record.AssetUrl;
            typeParam.Value = record.AssetType;
            refParam.Value = record.Referrer ?? string.Empty;
            await cmd.ExecuteNonQueryAsync();
        }

        await transaction.CommitAsync();
        return batch.Count;
    }

    public async Task<int> FlushMetadataAsync(int maxBatch)
    {
        if (_connection is null)
        {
            return 0;
        }

        var batch = DequeueBatch(_metaBuffer, maxBatch);
        if (batch.Count == 0)
        {
            return 0;
        }

        using var transaction = _connection.BeginTransaction();
        var cmd = _connection.CreateCommand();
        cmd.CommandText = @"INSERT OR REPLACE INTO metadata (url_hash, url, title)
VALUES ($hash, $url, $title)";
        var hashParam = cmd.CreateParameter();
        hashParam.ParameterName = "$hash";
        cmd.Parameters.Add(hashParam);
        var urlParam = cmd.CreateParameter();
        urlParam.ParameterName = "$url";
        cmd.Parameters.Add(urlParam);
        var titleParam = cmd.CreateParameter();
        titleParam.ParameterName = "$title";
        cmd.Parameters.Add(titleParam);

        foreach (var record in batch)
        {
            hashParam.Value = (long)record.UrlHash;
            urlParam.Value = record.Url;
            titleParam.Value = record.Title ?? string.Empty;
            await cmd.ExecuteNonQueryAsync();
        }

        var deleteTagsCmd = _connection.CreateCommand();
        deleteTagsCmd.CommandText = "DELETE FROM meta_tags WHERE url_hash = $hash";
        var deleteHashParam = deleteTagsCmd.CreateParameter();
        deleteHashParam.ParameterName = "$hash";
        deleteTagsCmd.Parameters.Add(deleteHashParam);

        var insertTagCmd = _connection.CreateCommand();
        insertTagCmd.CommandText = @"INSERT INTO meta_tags (url_hash, name, content)
VALUES ($hash, $name, $content)";
        var tagHashParam = insertTagCmd.CreateParameter();
        tagHashParam.ParameterName = "$hash";
        insertTagCmd.Parameters.Add(tagHashParam);
        var nameParam = insertTagCmd.CreateParameter();
        nameParam.ParameterName = "$name";
        insertTagCmd.Parameters.Add(nameParam);
        var contentParam = insertTagCmd.CreateParameter();
        contentParam.ParameterName = "$content";
        insertTagCmd.Parameters.Add(contentParam);

        var ftsCmd = _connection.CreateCommand();
        ftsCmd.CommandText = @"INSERT INTO pages_fts (rowid, url, title)
VALUES ($rowid, $url, $title)";
        var rowIdParam = ftsCmd.CreateParameter();
        rowIdParam.ParameterName = "$rowid";
        ftsCmd.Parameters.Add(rowIdParam);
        var ftsUrlParam = ftsCmd.CreateParameter();
        ftsUrlParam.ParameterName = "$url";
        ftsCmd.Parameters.Add(ftsUrlParam);
        var titleParam2 = ftsCmd.CreateParameter();
        titleParam2.ParameterName = "$title";
        ftsCmd.Parameters.Add(titleParam2);

        var metaFtsCmd = _connection.CreateCommand();
        metaFtsCmd.CommandText = @"INSERT INTO meta_fts (url, title, meta_name, meta_content)
VALUES ($url, $title, $metaName, $metaContent)";
        var metaUrlParam = metaFtsCmd.CreateParameter();
        metaUrlParam.ParameterName = "$url";
        metaFtsCmd.Parameters.Add(metaUrlParam);
        var metaTitleParam = metaFtsCmd.CreateParameter();
        metaTitleParam.ParameterName = "$title";
        metaFtsCmd.Parameters.Add(metaTitleParam);
        var metaNameParam = metaFtsCmd.CreateParameter();
        metaNameParam.ParameterName = "$metaName";
        metaFtsCmd.Parameters.Add(metaNameParam);
        var metaContentParam = metaFtsCmd.CreateParameter();
        metaContentParam.ParameterName = "$metaContent";
        metaFtsCmd.Parameters.Add(metaContentParam);

        var deleteMetaFtsCmd = _connection.CreateCommand();
        deleteMetaFtsCmd.CommandText = "DELETE FROM meta_fts WHERE url = $url";
        var deleteMetaUrlParam = deleteMetaFtsCmd.CreateParameter();
        deleteMetaUrlParam.ParameterName = "$url";
        deleteMetaFtsCmd.Parameters.Add(deleteMetaUrlParam);

        foreach (var record in batch)
        {
            rowIdParam.Value = (long)record.UrlHash;
            ftsUrlParam.Value = record.Url;
            titleParam2.Value = record.Title ?? string.Empty;
            await ftsCmd.ExecuteNonQueryAsync();

            deleteHashParam.Value = (long)record.UrlHash;
            await deleteTagsCmd.ExecuteNonQueryAsync();

            deleteMetaUrlParam.Value = record.Url;
            await deleteMetaFtsCmd.ExecuteNonQueryAsync();

            foreach (var tag in record.MetaTags)
            {
                tagHashParam.Value = (long)record.UrlHash;
                nameParam.Value = tag.Name;
                contentParam.Value = tag.Content;
                await insertTagCmd.ExecuteNonQueryAsync();

                metaUrlParam.Value = record.Url;
                metaTitleParam.Value = record.Title ?? string.Empty;
                metaNameParam.Value = tag.Name;
                metaContentParam.Value = tag.Content;
                await metaFtsCmd.ExecuteNonQueryAsync();
            }
        }

        await transaction.CommitAsync();
        return batch.Count;
    }

    public async Task<bool> SeenAsync(ulong urlHash, string url)
    {
        var cmd = _connection!.CreateCommand();
        cmd.CommandText = "SELECT 1 FROM seen WHERE url_hash = $hash LIMIT 1";
        cmd.Parameters.AddWithValue("$hash", (long)urlHash);
        var result = await cmd.ExecuteScalarAsync();
        if (result is not null)
        {
            return true;
        }

        var insertCmd = _connection.CreateCommand();
        insertCmd.CommandText = "INSERT OR IGNORE INTO seen (url_hash, url) VALUES ($hash, $url)";
        insertCmd.Parameters.AddWithValue("$hash", (long)urlHash);
        insertCmd.Parameters.AddWithValue("$url", url);
        await insertCmd.ExecuteNonQueryAsync();
        return false;
    }

    public async Task MarkSeenAsync(ulong urlHash, string url)
    {
        var insertCmd = _connection!.CreateCommand();
        insertCmd.CommandText = "INSERT OR IGNORE INTO seen (url_hash, url) VALUES ($hash, $url)";
        insertCmd.Parameters.AddWithValue("$hash", (long)urlHash);
        insertCmd.Parameters.AddWithValue("$url", url);
        await insertCmd.ExecuteNonQueryAsync();
    }

    public async Task<int> ExecuteNonQueryAsync(string sql)
    {
        var cmd = _connection!.CreateCommand();
        cmd.CommandText = sql;
        return await cmd.ExecuteNonQueryAsync();
    }

    private static List<T> DequeueBatch<T>(ConcurrentQueue<T> queue, int max)
    {
        var list = new List<T>(max);
        while (list.Count < max && queue.TryDequeue(out var item))
        {
            list.Add(item);
        }
        return list;
    }

    public async ValueTask DisposeAsync()
    {
        if (_connection is not null)
        {
            await _connection.DisposeAsync();
        }
    }
}
