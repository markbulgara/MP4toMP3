package metadata

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"golang.org/x/net/html"
)

const maxBodyBytes = 2 * 1024 * 1024

var videoExtensions = []string{
	".mp4", ".webm", ".mov", ".mkv", ".avi", ".flv", ".m3u8",
}

type Result struct {
	Title       string
	Description string
	Keywords    string
	ContentType string
	StatusCode  int
	VideoURLs   []string
	IsVideo     bool
}

func Fetch(ctx context.Context, client *http.Client, url string) (Result, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return Result{}, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return Result{}, err
	}
	defer resp.Body.Close()

	result := Result{
		ContentType: resp.Header.Get("Content-Type"),
		StatusCode:  resp.StatusCode,
	}

	if isVideoContentType(result.ContentType) {
		result.IsVideo = true
		return result, nil
	}

	limited := io.LimitReader(resp.Body, maxBodyBytes)
	body, err := io.ReadAll(limited)
	if err != nil {
		return result, err
	}

	if !strings.Contains(strings.ToLower(result.ContentType), "html") {
		result.IsVideo = hasVideoExtension(url)
		return result, nil
	}

	return parseHTML(body, result), nil
}

func parseHTML(body []byte, result Result) Result {
	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return result
	}

	var keywords []string
	var videoURLs []string
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "title":
				if n.FirstChild != nil {
					result.Title = strings.TrimSpace(n.FirstChild.Data)
				}
			case "meta":
				var name, content string
				for _, attr := range n.Attr {
					switch strings.ToLower(attr.Key) {
					case "name", "property":
						name = strings.ToLower(attr.Val)
					case "content":
						content = attr.Val
					}
				}
				if name == "description" {
					result.Description = content
				}
				if name == "keywords" {
					keywords = append(keywords, content)
				}
			case "video", "source":
				for _, attr := range n.Attr {
					if attr.Key == "src" && attr.Val != "" {
						videoURLs = append(videoURLs, attr.Val)
					}
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}

	walk(doc)
	result.VideoURLs = normalizeList(videoURLs)
	result.IsVideo = len(result.VideoURLs) > 0
	result.Keywords = strings.Join(normalizeList(keywords), ", ")
	return result
}

func normalizeList(values []string) []string {
	seen := map[string]struct{}{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}

func isVideoContentType(contentType string) bool {
	return strings.Contains(strings.ToLower(contentType), "video/")
}

func hasVideoExtension(url string) bool {
	lower := strings.ToLower(url)
	for _, ext := range videoExtensions {
		if strings.Contains(lower, ext) {
			return true
		}
	}
	return false
}

func EncodeVideoURLs(urls []string) string {
	if len(urls) == 0 {
		return ""
	}
	payload, err := json.Marshal(urls)
	if err != nil {
		return ""
	}
	return string(payload)
}

func NewHTTPClient(timeout time.Duration, userAgent string, maxConns int) *http.Client {
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		MaxIdleConns:          maxConns,
		MaxIdleConnsPerHost:   maxConns,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	return &http.Client{
		Timeout:   timeout,
		Transport: userAgentTransport{base: transport, userAgent: userAgent},
	}
}

type userAgentTransport struct {
	base      http.RoundTripper
	userAgent string
}

func (u userAgentTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	cloned := req.Clone(req.Context())
	if u.userAgent != "" {
		cloned.Header.Set("User-Agent", u.userAgent)
	}
	return u.base.RoundTrip(cloned)
}

func PrettyVideoURLs(encoded string) string {
	if encoded == "" {
		return ""
	}
	var urls []string
	if err := json.Unmarshal([]byte(encoded), &urls); err != nil {
		return encoded
	}
	return strings.Join(urls, ", ")
}

func FormatDuration(seconds int) string {
	return fmt.Sprintf("%ds", seconds)
}
