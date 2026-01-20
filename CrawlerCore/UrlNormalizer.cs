namespace CrawlerCore;

public sealed class UrlNormalizer
{
    private static readonly string[] TrackingPrefixes =
    {
        "utm_",
        "fbclid",
        "gclid",
        "mc_cid",
        "mc_eid"
    };

    public bool TryNormalize(string input, string baseUrl, CrawlSettings settings, out Uri normalized)
    {
        normalized = null!;
        if (string.IsNullOrWhiteSpace(input))
        {
            return false;
        }

        if (input.StartsWith("#", StringComparison.Ordinal))
        {
            return false;
        }

        if (input.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase) ||
            input.StartsWith("tel:", StringComparison.OrdinalIgnoreCase) ||
            input.StartsWith("javascript:", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (!Uri.TryCreate(input, UriKind.Absolute, out var uri))
        {
            if (!Uri.TryCreate(new Uri(baseUrl), input, out uri))
            {
                return false;
            }
        }

        if (!settings.AllowedSchemes.Contains(uri.Scheme))
        {
            return false;
        }

        var builder = new UriBuilder(uri)
        {
            Fragment = string.Empty
        };

        if (settings.DropTrackingParameters && !string.IsNullOrEmpty(builder.Query))
        {
            var query = builder.Query.TrimStart('?');
            var parts = query.Split('&', StringSplitOptions.RemoveEmptyEntries);
            var filtered = new List<string>();
            foreach (var part in parts)
            {
                var key = part.Split('=')[0];
                if (TrackingPrefixes.Any(prefix => key.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)))
                {
                    continue;
                }
                filtered.Add(part);
            }

            builder.Query = filtered.Count == 0 ? string.Empty : string.Join('&', filtered);
        }

        if (!string.IsNullOrEmpty(builder.Path))
        {
            builder.Path = builder.Path.Replace("//", "/", StringComparison.Ordinal);
        }

        foreach (var trap in settings.SkipPathContains)
        {
            if (builder.Path.Contains(trap, StringComparison.OrdinalIgnoreCase) ||
                builder.Query.Contains(trap, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
        }

        normalized = builder.Uri;
        return true;
    }

    public bool IsInScope(Uri url, Uri baseUrl, CrawlSettings settings)
    {
        if (settings.SameHostOnly)
        {
            return string.Equals(url.Host, baseUrl.Host, StringComparison.OrdinalIgnoreCase);
        }

        var domain = GetRegistrableDomain(baseUrl.Host);
        var targetDomain = GetRegistrableDomain(url.Host);
        return string.Equals(domain, targetDomain, StringComparison.OrdinalIgnoreCase);
    }

    private static string GetRegistrableDomain(string host)
    {
        var parts = host.Split('.', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2)
        {
            return host;
        }

        return string.Join('.', parts[^2], parts[^1]);
    }
}
