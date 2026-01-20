package metadata

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strings"
	"time"

	"golang.org/x/net/html"
)

const maxBodyBytes = 2 * 1024 * 1024

type Result struct {
	Title       string
	Description string
	Keywords    string
	ContentType string
	StatusCode  int
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

	limited := io.LimitReader(resp.Body, maxBodyBytes)
	body, err := io.ReadAll(limited)
	if err != nil {
		return result, err
	}

	if !strings.Contains(strings.ToLower(result.ContentType), "html") {
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
