using CrawlerCore;
using Microsoft.Data.Sqlite;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Threading;

namespace CrawlerApp.Wpf;

public sealed class MainViewModel : INotifyPropertyChanged
{
    private string _targetUrl = "https://example.com";
    private string _searchPagesQuery = string.Empty;
    private string _searchAssetsQuery = string.Empty;
    private string _searchMetadataQuery = string.Empty;
    private string _statsQueued = "0";
    private string _statsFetched = "0";
    private string _statsParsed = "0";
    private string _statsErrors = "0";
    private string _statsAssets = "0";
    private string _statsPagesPerMinute = "0";
    private bool _respectRobots = true;
    private bool _sameHostOnly = true;
    private bool _highThroughput;
    private bool _enableEnrichment = true;
    private int _minUrlLength = 8;
    private int _maxUrlLength = 2048;
    private CancellationTokenSource? _cts;
    private CrawlerEngine? _engine;
    private SqliteCrawlStore? _store;
    private string? _dbPath;
    private readonly DispatcherTimer _searchRefreshTimer;
    private readonly SemaphoreSlim _pagesSearchGate = new(1, 1);
    private readonly SemaphoreSlim _assetsSearchGate = new(1, 1);
    private readonly SemaphoreSlim _metadataSearchGate = new(1, 1);

    public ObservableCollection<PageRecord> Pages { get; } = new();
    public ObservableCollection<AssetRecord> Assets { get; } = new();
    public ObservableCollection<MetadataResult> MetadataResults { get; } = new();
    public ObservableCollection<string> Logs { get; } = new();
    public ObservableCollection<string> Errors { get; } = new();

    public RelayCommand StartCommand { get; }
    public RelayCommand StopCommand { get; }
    public RelayCommand LoadResultsCommand { get; }

    public string TargetUrl
    {
        get => _targetUrl;
        set => SetField(ref _targetUrl, value);
    }

    public string SearchPagesQuery
    {
        get => _searchPagesQuery;
        set
        {
            if (SetField(ref _searchPagesQuery, value))
            {
                _ = SearchPagesAsync(value);
            }
        }
    }

    public string SearchAssetsQuery
    {
        get => _searchAssetsQuery;
        set
        {
            if (SetField(ref _searchAssetsQuery, value))
            {
                _ = SearchAssetsAsync(value);
            }
        }
    }

    public string SearchMetadataQuery
    {
        get => _searchMetadataQuery;
        set
        {
            if (SetField(ref _searchMetadataQuery, value))
            {
                _ = SearchMetadataAsync(value);
            }
        }
    }

    public string StatsQueued { get => _statsQueued; set => SetField(ref _statsQueued, value); }
    public string StatsFetched { get => _statsFetched; set => SetField(ref _statsFetched, value); }
    public string StatsParsed { get => _statsParsed; set => SetField(ref _statsParsed, value); }
    public string StatsErrors { get => _statsErrors; set => SetField(ref _statsErrors, value); }
    public string StatsAssets { get => _statsAssets; set => SetField(ref _statsAssets, value); }
    public string StatsPagesPerMinute { get => _statsPagesPerMinute; set => SetField(ref _statsPagesPerMinute, value); }
    public bool RespectRobots { get => _respectRobots; set => SetField(ref _respectRobots, value); }
    public bool SameHostOnly { get => _sameHostOnly; set => SetField(ref _sameHostOnly, value); }
    public bool HighThroughput { get => _highThroughput; set => SetField(ref _highThroughput, value); }
    public bool EnableEnrichment { get => _enableEnrichment; set => SetField(ref _enableEnrichment, value); }
    public int MinUrlLength { get => _minUrlLength; set => SetField(ref _minUrlLength, value); }
    public int MaxUrlLength { get => _maxUrlLength; set => SetField(ref _maxUrlLength, value); }

    public MainViewModel()
    {
        StartCommand = new RelayCommand(() => _ = StartAsync(), () => _engine is null);
        StopCommand = new RelayCommand(Stop, () => _engine is not null);
        LoadResultsCommand = new RelayCommand(() => _ = LoadResultsAsync(), () => _engine is null);
        _searchRefreshTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(1)
        };
        _searchRefreshTimer.Tick += (_, _) => RefreshSearches();
    }

    private async Task StartAsync()
    {
        if (_engine is not null)
        {
            return;
        }

        var outputDir = Path.Combine(AppContext.BaseDirectory, "results", DateTimeOffset.UtcNow.ToString("yyyyMMdd_HHmmss"));
        Directory.CreateDirectory(outputDir);
        _dbPath = Path.Combine(outputDir, "crawl.db");

        _store = new SqliteCrawlStore(_dbPath);
        await _store.InitializeAsync();

        var settings = new CrawlSettings
        {
            RespectRobots = RespectRobots,
            SameHostOnly = SameHostOnly,
            EnableEnrichment = EnableEnrichment,
            MinUrlLength = MinUrlLength,
            MaxUrlLength = MaxUrlLength
        };

        if (HighThroughput)
        {
            settings = settings.WithHighThroughputDefaults();
        }
        var logBuffer = new CrawlEventBuffer();
        _engine = new CrawlerEngine(settings, _store, logBuffer);
        _engine.StatsUpdated += UpdateStats;
        _engine.LogWritten += AddLog;
        _cts = new CancellationTokenSource();
        _searchRefreshTimer.Start();

        StartCommand.RaiseCanExecuteChanged();
        StopCommand.RaiseCanExecuteChanged();
        LoadResultsCommand.RaiseCanExecuteChanged();

        _ = Task.Run(() => _engine.StartAsync(TargetUrl, _cts.Token));
    }

    private void Stop()
    {
        _cts?.Cancel();
        _engine = null;
        _searchRefreshTimer.Stop();
        StartCommand.RaiseCanExecuteChanged();
        StopCommand.RaiseCanExecuteChanged();
        LoadResultsCommand.RaiseCanExecuteChanged();
    }

    private async Task LoadResultsAsync()
    {
        var openDialog = new Microsoft.Win32.OpenFileDialog
        {
            Filter = "Crawl Database (*.db)|*.db",
            Title = "Open Crawl Database"
        };

        if (openDialog.ShowDialog() != true)
        {
            return;
        }

        _dbPath = openDialog.FileName;

        Application.Current.Dispatcher.Invoke(() =>
        {
            Pages.Clear();
            Assets.Clear();
            MetadataResults.Clear();
            Logs.Clear();
            Errors.Clear();
        });

        _searchRefreshTimer.Start();

        if (!string.IsNullOrWhiteSpace(SearchPagesQuery))
        {
            await SearchPagesAsync(SearchPagesQuery);
        }

        if (!string.IsNullOrWhiteSpace(SearchAssetsQuery))
        {
            await SearchAssetsAsync(SearchAssetsQuery);
        }

        if (!string.IsNullOrWhiteSpace(SearchMetadataQuery))
        {
            await SearchMetadataAsync(SearchMetadataQuery);
        }
    }

    private void UpdateStats(CrawlStats stats)
    {
        Application.Current.Dispatcher.Invoke(() =>
        {
            StatsQueued = stats.Queued.ToString("N0");
            StatsFetched = stats.Fetched.ToString("N0");
            StatsParsed = stats.Parsed.ToString("N0");
            StatsErrors = stats.Errors.ToString("N0");
            StatsAssets = stats.AssetsFound.ToString("N0");
            StatsPagesPerMinute = stats.PagesPerMinute.ToString("N0");
        });
    }

    private void AddLog(CrawlLogEntry entry)
    {
        Application.Current.Dispatcher.Invoke(() =>
        {
            Logs.Add($"[{entry.Timestamp:HH:mm:ss}] {entry.Level}: {entry.Message}");
            if (Logs.Count > 2000)
            {
                Logs.RemoveAt(0);
            }

            if (string.Equals(entry.Level, "error", StringComparison.OrdinalIgnoreCase))
            {
                Errors.Add($"[{entry.Timestamp:HH:mm:ss}] {entry.Message}");
                if (Errors.Count > 2000)
                {
                    Errors.RemoveAt(0);
                }
            }
        });
    }

    private async Task SearchPagesAsync(string query)
    {
        if (string.IsNullOrWhiteSpace(query) || string.IsNullOrEmpty(_dbPath))
        {
            Application.Current.Dispatcher.Invoke(Pages.Clear);
            return;
        }

        var pages = new List<PageRecord>();

        if (!await _pagesSearchGate.WaitAsync(0))
        {
            return;
        }

        try
        {
            await Task.Run(async () =>
            {
                await using var connection = new SqliteConnection($"Data Source={_dbPath}");
                await connection.OpenAsync();

                static string ReadString(SqliteDataReader reader, int index) =>
                    reader.IsDBNull(index) ? string.Empty : reader.GetString(index);

                var cmd = connection.CreateCommand();
                cmd.CommandText = @"SELECT p.url, p.url_hash, p.status_code, p.content_type, p.title_snippet, p.final_url, p.referrer
FROM pages p
JOIN pages_fts f ON f.rowid = p.url_hash
WHERE pages_fts MATCH $query";
                cmd.Parameters.AddWithValue("$query", query);

                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    pages.Add(new PageRecord(
                        Guid.Empty,
                        reader.GetString(0),
                        (ulong)reader.GetInt64(1),
                        reader.GetInt32(2),
                        ReadString(reader, 3),
                        ReadString(reader, 4),
                        ReadString(reader, 5),
                        ReadString(reader, 6)));
                }

            });
        }
        finally
        {
            _pagesSearchGate.Release();
        }

        Application.Current.Dispatcher.Invoke(() =>
        {
            Pages.Clear();
            foreach (var page in pages)
            {
                Pages.Add(page);
            }

        });
    }

    private async Task SearchAssetsAsync(string query)
    {
        if (string.IsNullOrWhiteSpace(query) || string.IsNullOrEmpty(_dbPath))
        {
            Application.Current.Dispatcher.Invoke(Assets.Clear);
            return;
        }

        var assets = new List<AssetRecord>();
        if (!await _assetsSearchGate.WaitAsync(0))
        {
            return;
        }
        try
        {
            await Task.Run(async () =>
            {
                await using var connection = new SqliteConnection($"Data Source={_dbPath}");
                await connection.OpenAsync();

                var assetCmd = connection.CreateCommand();
                assetCmd.CommandText = "SELECT page_url, asset_url, asset_type FROM assets WHERE asset_url LIKE $like";
                assetCmd.Parameters.AddWithValue("$like", "%" + query + "%");
                await using var assetReader = await assetCmd.ExecuteReaderAsync();
                while (await assetReader.ReadAsync())
                {
                    assets.Add(new AssetRecord(Guid.Empty, assetReader.GetString(0), 0, assetReader.GetString(1), assetReader.GetString(2), string.Empty));
                }
            });
        }
        finally
        {
            _assetsSearchGate.Release();
        }

        Application.Current.Dispatcher.Invoke(() =>
        {
            Assets.Clear();
            foreach (var asset in assets)
            {
                Assets.Add(asset);
            }
        });
    }

    private async Task SearchMetadataAsync(string query)
    {
        if (string.IsNullOrWhiteSpace(query) || string.IsNullOrEmpty(_dbPath))
        {
            Application.Current.Dispatcher.Invoke(MetadataResults.Clear);
            return;
        }

        var metadata = new List<MetadataResult>();
        if (!await _metadataSearchGate.WaitAsync(0))
        {
            return;
        }
        try
        {
            await Task.Run(async () =>
            {
                await using var connection = new SqliteConnection($"Data Source={_dbPath}");
                await connection.OpenAsync();

                static string ReadString(SqliteDataReader reader, int index) =>
                    reader.IsDBNull(index) ? string.Empty : reader.GetString(index);

                var metaCmd = connection.CreateCommand();
                metaCmd.CommandText = @"SELECT url, title, meta_name, meta_content
FROM meta_fts
WHERE meta_fts MATCH $query
UNION
SELECT m.url, m.title, t.name, t.content
FROM meta_tags t
JOIN metadata m ON m.url_hash = t.url_hash
WHERE t.name LIKE $like OR t.content LIKE $like";
                metaCmd.Parameters.AddWithValue("$query", query);
                metaCmd.Parameters.AddWithValue("$like", "%" + query + "%");
                try
                {
                    await using var metaReader = await metaCmd.ExecuteReaderAsync();
                    while (await metaReader.ReadAsync())
                    {
                        metadata.Add(new MetadataResult(
                            ReadString(metaReader, 0),
                            ReadString(metaReader, 1),
                            ReadString(metaReader, 2),
                            ReadString(metaReader, 3)));
                    }
                }
                catch (SqliteException)
                {
                    var fallbackCmd = connection.CreateCommand();
                    fallbackCmd.CommandText = @"SELECT m.url, m.title, t.name, t.content
FROM meta_tags t
JOIN metadata m ON m.url_hash = t.url_hash
WHERE t.name LIKE $like OR t.content LIKE $like";
                    fallbackCmd.Parameters.AddWithValue("$like", "%" + query + "%");
                    await using var fallbackReader = await fallbackCmd.ExecuteReaderAsync();
                    while (await fallbackReader.ReadAsync())
                    {
                        metadata.Add(new MetadataResult(
                            ReadString(fallbackReader, 0),
                            ReadString(fallbackReader, 1),
                            ReadString(fallbackReader, 2),
                            ReadString(fallbackReader, 3)));
                    }
                }
            });
        }
        finally
        {
            _metadataSearchGate.Release();
        }

        Application.Current.Dispatcher.Invoke(() =>
        {
            MetadataResults.Clear();
            foreach (var result in metadata)
            {
                MetadataResults.Add(result);
            }
        });
    }

    private void RefreshSearches()
    {
        if (string.IsNullOrWhiteSpace(_dbPath))
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(SearchPagesQuery))
        {
            _ = SearchPagesAsync(SearchPagesQuery);
        }

        if (!string.IsNullOrWhiteSpace(SearchAssetsQuery))
        {
            _ = SearchAssetsAsync(SearchAssetsQuery);
        }

        if (!string.IsNullOrWhiteSpace(SearchMetadataQuery))
        {
            _ = SearchMetadataAsync(SearchMetadataQuery);
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private bool SetField<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
        {
            return false;
        }

        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        return true;
    }
}

public sealed record MetadataResult(
    string Url,
    string Title,
    string MetaName,
    string MetaContent);
