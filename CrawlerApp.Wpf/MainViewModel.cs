using CrawlerCore;
using Microsoft.Data.Sqlite;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Runtime.CompilerServices;
using System.Windows;

namespace CrawlerApp.Wpf;

public sealed class MainViewModel : INotifyPropertyChanged
{
    private string _targetUrl = "https://example.com";
    private string _searchQuery = string.Empty;
    private string _statsQueued = "0";
    private string _statsFetched = "0";
    private string _statsParsed = "0";
    private string _statsErrors = "0";
    private string _statsAssets = "0";
    private string _statsPagesPerMinute = "0";
    private CancellationTokenSource? _cts;
    private CrawlerEngine? _engine;
    private SqliteCrawlStore? _store;
    private string? _dbPath;

    public ObservableCollection<PageRecord> Pages { get; } = new();
    public ObservableCollection<AssetRecord> Assets { get; } = new();
    public ObservableCollection<string> Logs { get; } = new();

    public RelayCommand StartCommand { get; }
    public RelayCommand StopCommand { get; }

    public string TargetUrl
    {
        get => _targetUrl;
        set => SetField(ref _targetUrl, value);
    }

    public string SearchQuery
    {
        get => _searchQuery;
        set
        {
            if (SetField(ref _searchQuery, value))
            {
                _ = SearchAsync(value);
            }
        }
    }

    public string StatsQueued { get => _statsQueued; set => SetField(ref _statsQueued, value); }
    public string StatsFetched { get => _statsFetched; set => SetField(ref _statsFetched, value); }
    public string StatsParsed { get => _statsParsed; set => SetField(ref _statsParsed, value); }
    public string StatsErrors { get => _statsErrors; set => SetField(ref _statsErrors, value); }
    public string StatsAssets { get => _statsAssets; set => SetField(ref _statsAssets, value); }
    public string StatsPagesPerMinute { get => _statsPagesPerMinute; set => SetField(ref _statsPagesPerMinute, value); }

    public MainViewModel()
    {
        StartCommand = new RelayCommand(() => _ = StartAsync(), () => _engine is null);
        StopCommand = new RelayCommand(Stop, () => _engine is not null);
    }

    private async Task StartAsync()
    {
        if (_engine is not null)
        {
            return;
        }

        var outputDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CrawlerApp", DateTimeOffset.UtcNow.ToString("yyyyMMdd_HHmmss"));
        Directory.CreateDirectory(outputDir);
        _dbPath = Path.Combine(outputDir, "crawl.db");

        _store = new SqliteCrawlStore(_dbPath);
        await _store.InitializeAsync();

        var settings = new CrawlSettings();
        var logBuffer = new CrawlEventBuffer();
        _engine = new CrawlerEngine(settings, _store, logBuffer);
        _engine.StatsUpdated += UpdateStats;
        _engine.LogWritten += AddLog;
        _cts = new CancellationTokenSource();

        StartCommand.RaiseCanExecuteChanged();
        StopCommand.RaiseCanExecuteChanged();

        _ = Task.Run(() => _engine.StartAsync(TargetUrl, _cts.Token));
    }

    private void Stop()
    {
        _cts?.Cancel();
        _engine = null;
        StartCommand.RaiseCanExecuteChanged();
        StopCommand.RaiseCanExecuteChanged();
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
        });
    }

    private async Task SearchAsync(string query)
    {
        if (string.IsNullOrWhiteSpace(query) || string.IsNullOrEmpty(_dbPath))
        {
            return;
        }

        var pages = new List<PageRecord>();
        var assets = new List<AssetRecord>();

        await Task.Run(async () =>
        {
            await using var connection = new SqliteConnection($"Data Source={_dbPath}");
            await connection.OpenAsync();

            var cmd = connection.CreateCommand();
            cmd.CommandText = @"SELECT p.url, p.url_hash, p.status_code, p.content_type, p.title_snippet, p.final_url, p.referrer
FROM pages p
JOIN pages_fts f ON f.rowid = p.url_hash
WHERE pages_fts MATCH $query
LIMIT 200";
            cmd.Parameters.AddWithValue("$query", query);

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                pages.Add(new PageRecord(
                    Guid.Empty,
                    reader.GetString(0),
                    (ulong)reader.GetInt64(1),
                    reader.GetInt32(2),
                    reader.GetString(3),
                    reader.GetString(4),
                    reader.GetString(5),
                    reader.GetString(6)));
            }

            var assetCmd = connection.CreateCommand();
            assetCmd.CommandText = "SELECT page_url, asset_url, asset_type FROM assets WHERE asset_url LIKE $like LIMIT 200";
            assetCmd.Parameters.AddWithValue("$like", "%" + query + "%");
            await using var assetReader = await assetCmd.ExecuteReaderAsync();
            while (await assetReader.ReadAsync())
            {
                assets.Add(new AssetRecord(Guid.Empty, assetReader.GetString(0), 0, assetReader.GetString(1), assetReader.GetString(2), string.Empty));
            }
        });

        Application.Current.Dispatcher.Invoke(() =>
        {
            Pages.Clear();
            foreach (var page in pages)
            {
                Pages.Add(page);
            }

            Assets.Clear();
            foreach (var asset in assets)
            {
                Assets.Add(asset);
            }
        });
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
