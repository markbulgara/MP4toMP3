package metadata

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"golang.org/x/net/html"
)

const maxPreviewBytes = 64 * 1024

type Result struct {
	Title       string
	Description string
	Keywords    string
	ContentType string
	StatusCode  int
	Bytes       int64
}

func Fetch(ctx context.Context, client *http.Client, url string) (Result, error) {
	headReq, err := http.NewRequestWithContext(ctx, http.MethodHead, url, nil)
	if err != nil {
		return Result{}, err
	}

	headResp, err := client.Do(headReq)
	if err == nil {
		headResp.Body.Close()
		result := Result{
			ContentType: headResp.Header.Get("Content-Type"),
			StatusCode:  headResp.StatusCode,
			Bytes:       headResp.ContentLength,
		}
		if result.Bytes < 0 {
			result.Bytes = parseLength(headResp.Header.Get("Content-Length"))
		}
		if headResp.StatusCode != http.StatusMethodNotAllowed && headResp.StatusCode != http.StatusForbidden &&
			result.ContentType != "" {
			return result, nil
		}
	}

	getReq, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return Result{}, err
	}
	getReq.Header.Set("Range", "bytes=0-65535")
	resp, err := client.Do(getReq)
	if err != nil {
		return Result{}, err
	}
	defer resp.Body.Close()

	result := Result{
		ContentType: resp.Header.Get("Content-Type"),
		StatusCode:  resp.StatusCode,
		Bytes:       resp.ContentLength,
	}
	if result.Bytes < 0 {
		result.Bytes = parseLength(resp.Header.Get("Content-Length"))
	}

	limited := io.LimitReader(resp.Body, maxPreviewBytes)
	body, err := io.ReadAll(limited)
	if err != nil {
		return result, err
	}

	if !strings.Contains(strings.ToLower(result.ContentType), "html") {
		return result, nil
	}

	parsed := parseHTML(body, result)
	parsed.Description = ""
	parsed.Keywords = ""
	return parsed, nil
}

func parseHTML(body []byte, result Result) Result {
	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return result
	}

	var keywords []string
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
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}

	walk(doc)
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

func parseLength(value string) int64 {
	if value == "" {
		return 0
	}
	parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil {
		return 0
	}
	return parsed
}
