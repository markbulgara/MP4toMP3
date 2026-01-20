using System.Text.RegularExpressions;

namespace CrawlerCore;

public sealed class LinkExtractor
{
    private static readonly Regex InlineUrlRegex = new(
        @"(?<url>(https?:)?//[^\s'\"<>\\)]+)",
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
        Uri baseUri)
    {
        var body = fetch.Body ?? Array.Empty<byte>();
        var content = System.Text.Encoding.UTF8.GetString(body);
        var links = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var assets = new List<AssetRecord>();

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
            fetch.Referrer);
    }

    public EnrichedMetadata ExtractEnriched(string html, ulong urlHash, string url)
    {
        return new EnrichedMetadata(
            urlHash,
            url,
            ExtractTagContent(html, "title"),
            ExtractMetaContent(html, "description"),
            ExtractMetaContent(html, "og:title"),
            ExtractMetaContent(html, "og:description"),
            ExtractMetaContent(html, "og:video"),
            ExtractMetaContent(html, "twitter:player"),
            ExtractTagContent(html, "h1"));
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

    private static string? ExtractMetaContent(string html, string name)
    {
        var pattern = "name=\"" + name + "\"";
        var propertyPattern = "property=\"" + name + "\"";
        var idx = html.IndexOf(pattern, StringComparison.OrdinalIgnoreCase);
        if (idx < 0)
        {
            idx = html.IndexOf(propertyPattern, StringComparison.OrdinalIgnoreCase);
        }

        if (idx < 0)
        {
            return null;
        }

        var contentIndex = html.IndexOf("content=", idx, StringComparison.OrdinalIgnoreCase);
        if (contentIndex < 0)
        {
            return null;
        }

        contentIndex += "content=".Length;
        if (contentIndex >= html.Length)
        {
            return null;
        }

        var quote = html[contentIndex];
        if (quote != '\'' && quote != '"')
        {
            return null;
        }

        contentIndex++;
        var end = html.IndexOf(quote, contentIndex);
        if (end < 0)
        {
            return null;
        }

        return html.Substring(contentIndex, end - contentIndex).Trim();
    }
}
