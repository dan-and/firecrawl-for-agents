import { scrapeSingleUrl } from "../single_url";
import * as fetchModule from "../scrapers/fetch";

jest.mock("../scrapers/fetch");
const mockFetch = fetchModule.scrapeWithFetch as jest.MockedFunction<
  typeof fetchModule.scrapeWithFetch
>;

describe("scrapeSingleUrl — fallback loop break conditions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure PLAYWRIGHT_MICROSERVICE_URL is unset so only fetch is tried
    delete process.env.PLAYWRIGHT_MICROSERVICE_URL;
  });

  it("stops after a 415 response and does not retry", async () => {
    mockFetch.mockResolvedValueOnce({
      content: "",
      pageStatusCode: 415,
      pageError: "HTTP 415",
    });

    const result = await scrapeSingleUrl("https://example.com/file.bin", {
      includeMarkdown: false,
    });

    // fetch was called exactly once — no retry
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.metadata.pageStatusCode).toBe(415);
  });

  it("stops after a 404 response (existing behaviour, sanity check)", async () => {
    mockFetch.mockResolvedValueOnce({
      content: "",
      pageStatusCode: 404,
      pageError: "HTTP 404",
    });

    const result = await scrapeSingleUrl("https://example.com/missing", {
      includeMarkdown: false,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.metadata.pageStatusCode).toBe(404);
  });

  it("stops after a 500 response (existing behaviour, sanity check)", async () => {
    mockFetch.mockResolvedValueOnce({
      content: "",
      pageStatusCode: 500,
      pageError: "HTTP 500",
    });

    const result = await scrapeSingleUrl("https://example.com/error", {
      includeMarkdown: false,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.metadata.pageStatusCode).toBe(500);
  });
});

import * as markdownModule from "../../../lib/html-to-markdown";
jest.mock("../../../lib/html-to-markdown");
const mockParseMarkdown = markdownModule.parseMarkdown as jest.MockedFunction<
  typeof markdownModule.parseMarkdown
>;

describe("scrapeSingleUrl — markdown size guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PLAYWRIGHT_MICROSERVICE_URL;
    mockParseMarkdown.mockResolvedValue("converted markdown");
  });

  it("calls parseMarkdown for HTML under 300 KB", async () => {
    mockFetch.mockResolvedValueOnce({
      content: "<p>small</p>",
      pageStatusCode: 200,
      pageError: null,
    });

    await scrapeSingleUrl("https://example.com", { includeMarkdown: true });

    expect(mockParseMarkdown).toHaveBeenCalled();
  });

  it("truncates and converts HTML over 500 KB (never bypasses parseMarkdown)", async () => {
    const bigHtml = "<p>" + "x".repeat(510 * 1024) + "</p>";
    mockFetch.mockResolvedValueOnce({
      content: bigHtml,
      pageStatusCode: 200,
      pageError: null,
    });

    await scrapeSingleUrl("https://example.com/big", {
      includeMarkdown: true,
    });

    // parseMarkdown is always called — oversized HTML is truncated, not bypassed
    expect(mockParseMarkdown).toHaveBeenCalled();
  });

  it("returns empty markdown when parseMarkdown returns raw HTML (consent wall guard)", async () => {
    // Simulate what happens when a consent-wall page slips through:
    // parseMarkdown returns the raw HTML string instead of converted text.
    mockParseMarkdown.mockResolvedValue("<!DOCTYPE html><html><body>consent wall</body></html>");
    mockFetch.mockResolvedValueOnce({
      content: "<html><body>consent wall</body></html>",
      pageStatusCode: 200,
      pageError: null,
    });

    const result = await scrapeSingleUrl("https://example.com/consent", {
      includeMarkdown: true,
    });

    // The quality guard must produce empty string, not the raw HTML
    expect(result.markdown).toBe("");
    expect(result.content).toBe("");
  });
});

describe("scrapeSingleUrl — format field isolation", () => {
  const PAGE_HTML = `
    <html><head><title>Test Page</title></head>
    <body>
      <nav><a href="/nav">Nav</a></nav>
      <main><h1>Hello World</h1><p>Content here.</p></main>
      <footer>Footer</footer>
    </body></html>
  `;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PLAYWRIGHT_MICROSERVICE_URL;
    mockParseMarkdown.mockImplementation(async (html) => {
      // Simple passthrough: return a fake markdown string so we can assert it's set
      return html.includes("Hello World") ? "# Hello World\n\nContent here." : "";
    });
    mockFetch.mockResolvedValue({
      content: PAGE_HTML,
      pageStatusCode: 200,
      pageError: null,
    });
  });

  it("includeMarkdown=true sets markdown field, includeRawHtml=false omits rawHtml", async () => {
    const result = await scrapeSingleUrl("https://example.com", {
      includeMarkdown: true,
      includeRawHtml: false,
      includeHtml: false,
    });
    expect(result.markdown).toBeTruthy();
    expect(result.rawHtml).toBeUndefined();
    expect(result.html).toBeUndefined();
  });

  it("includeRawHtml=true sets rawHtml to verbatim scraper output", async () => {
    const result = await scrapeSingleUrl("https://example.com", {
      includeMarkdown: false,
      includeRawHtml: true,
      includeHtml: false,
    });
    // rawHtml must be set and contain the original HTML (including nav/footer that cleaning would remove)
    expect(result.rawHtml).toBeDefined();
    expect(result.rawHtml).toContain("<nav>");
    expect(result.rawHtml).toContain("<footer>");
    expect(result.markdown).toBeUndefined();
    // html is also set when includeRawHtml=true (both are gated together in single_url.ts)
    expect(result.html).toBeDefined();
  });

  it("includeHtml=true sets html, includeRawHtml=false omits rawHtml", async () => {
    const result = await scrapeSingleUrl("https://example.com", {
      includeMarkdown: false,
      includeRawHtml: false,
      includeHtml: true,
    });
    expect(result.html).toBeDefined();
    expect(result.rawHtml).toBeUndefined();
    expect(result.markdown).toBeUndefined();
  });

  it("html field has script/style stripped compared to rawHtml", async () => {
    const htmlWithScripts = `
      <html><head><script>alert(1)</script><style>body{color:red}</style></head>
      <body><main><h1>Real Content</h1></main></body></html>
    `;
    mockFetch.mockResolvedValueOnce({
      content: htmlWithScripts,
      pageStatusCode: 200,
      pageError: null,
    });

    const result = await scrapeSingleUrl("https://example.com", {
      includeHtml: true,
      includeRawHtml: true,
    });

    // rawHtml is verbatim — must contain the script/style
    expect(result.rawHtml).toContain("<script>");
    expect(result.rawHtml).toContain("<style>");
    // html is cleaned — must not contain script/style
    expect(result.html).not.toContain("<script>");
    expect(result.html).not.toContain("<style>");
    // and html must be smaller (noise removed)
    expect((result.html || "").length).toBeLessThan((result.rawHtml || "").length);
  });
});
