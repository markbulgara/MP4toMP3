using System.Text.RegularExpressions;

namespace CrawlerCore;

public sealed class LinkExtractor
{
    private static readonly Regex InlineUrlRegex = new(
        @"(?<url>(https?:)?//[^\s'""<>\\)]+)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly string[] Attributes =
    {
        "href",
        "src"
    };

    private static readonly string[] VideoExtensions =
    {
        ".mp4",
        ".webm",
        ".m3u8",
        ".mpd"
    };

    public ParseResult ParseHtml(
        FetchResult fetch,
        UrlNormalizer normalizer,
        CrawlSettings settings,
        Uri baseUri,
        bool extractMetaTags)
    {
        var body = fetch.Body ?? Array.Empty<byte>();
        var content = System.Text.Encoding.UTF8.GetString(body);
        var links = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var assets = new List<AssetRecord>();
        var metaTags = extractMetaTags ? ExtractMetaTags(content) : Array.Empty<MetaTagRecord>();

        foreach (var attr in Attributes)
        {
            ExtractAttributeLinks(content, attr, links);
        }

        foreach (Match match in InlineUrlRegex.Matches(content))
        {
            if (match.Groups["url"].Success)
            {
                links.Add(match.Groups["url"].Value);
            }
        }

        var normalizedLinks = new List<string>();
        foreach (var link in links)
        {
            if (normalizer.TryNormalize(link, fetch.FinalUrl, settings, out var normalizedUri))
            {
                if (!normalizer.IsInScope(normalizedUri, baseUri, settings))
                {
                    continue;
                }

                normalizedLinks.Add(normalizedUri.ToString());
            }
        }

        foreach (var link in normalizedLinks)
        {
            if (VideoExtensions.Any(ext => link.EndsWith(ext, StringComparison.OrdinalIgnoreCase)))
            {
                assets.Add(new AssetRecord(Guid.Empty, fetch.Url, Hashing.XxHash64(fetch.Url), link, "asset", fetch.Referrer));
            }
        }

        var title = ExtractTitle(content);

        return new ParseResult(
            fetch.Url,
            fetch.FinalUrl,
            fetch.StatusCode,
            fetch.ContentType,
            title,
            normalizedLinks,
            assets,
            metaTags,
            fetch.Referrer);
    }

    public EnrichedMetadata ExtractEnriched(string html, ulong urlHash, string url)
    {
        return new EnrichedMetadata(
            urlHash,
            url,
            ExtractTagContent(html, "title"),
            ExtractMetaTags(html));
    }

    private static void ExtractAttributeLinks(string content, string attribute, HashSet<string> output)
    {
        var pattern = attribute + "=";
        var index = 0;
        while (index < content.Length)
        {
            var found = content.IndexOf(pattern, index, StringComparison.OrdinalIgnoreCase);
            if (found < 0)
            {
                break;
            }

            var valueStart = found + pattern.Length;
            while (valueStart < content.Length && char.IsWhiteSpace(content[valueStart]))
            {
                valueStart++;
            }

            if (valueStart >= content.Length)
            {
                break;
            }

            var quote = content[valueStart];
            if (quote != '\'' && quote != '"')
            {
                index = valueStart;
                continue;
            }

            valueStart++;
            var valueEnd = content.IndexOf(quote, valueStart);
            if (valueEnd < 0)
            {
                break;
            }

            var value = content.Substring(valueStart, valueEnd - valueStart);
            if (!string.IsNullOrWhiteSpace(value))
            {
                output.Add(value);
            }

            index = valueEnd + 1;
        }
    }

    private static string? ExtractTitle(string content)
    {
        return ExtractTagContent(content, "title");
    }

    private static string? ExtractTagContent(string content, string tagName)
    {
        var open = "<" + tagName;
        var openIndex = content.IndexOf(open, StringComparison.OrdinalIgnoreCase);
        if (openIndex < 0)
        {
            return null;
        }

        var start = content.IndexOf('>', openIndex);
        if (start < 0)
        {
            return null;
        }

        start++;
        var close = "</" + tagName + ">";
        var end = content.IndexOf(close, start, StringComparison.OrdinalIgnoreCase);
        if (end < 0)
        {
            return null;
        }

        return content.Substring(start, end - start).Trim();
    }

    private static IReadOnlyList<MetaTagRecord> ExtractMetaTags(string html)
    {
        var results = new List<MetaTagRecord>();
        foreach (Match match in Regex.Matches(html, "<meta\\s+[^>]*>", RegexOptions.IgnoreCase))
        {
            var tag = match.Value;
            var name = ExtractAttribute(tag, "name") ?? ExtractAttribute(tag, "property");
            var content = ExtractAttribute(tag, "content");
            if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(content))
            {
                continue;
            }

            results.Add(new MetaTagRecord(name.Trim(), content.Trim()));
        }

        return results;
    }

    private static string? ExtractAttribute(string tag, string attribute)
    {
        var pattern = attribute + "\\s*=\\s*([\"'])(?<value>.*?)\\1";
        var match = Regex.Match(tag, pattern, RegexOptions.IgnoreCase);
        return match.Success ? match.Groups["value"].Value : null;
    }
}
