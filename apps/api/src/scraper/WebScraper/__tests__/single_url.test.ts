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

  it("skips parseMarkdown for HTML over 300 KB", async () => {
    const bigHtml = "<p>" + "x".repeat(310 * 1024) + "</p>";
    mockFetch.mockResolvedValueOnce({
      content: bigHtml,
      pageStatusCode: 200,
      pageError: null,
    });

    const result = await scrapeSingleUrl("https://example.com/big", {
      includeMarkdown: true,
    });

    expect(mockParseMarkdown).not.toHaveBeenCalled();
    // The content field should be the raw HTML, not empty
    expect(result.content.length).toBeGreaterThan(0);
  });
});
