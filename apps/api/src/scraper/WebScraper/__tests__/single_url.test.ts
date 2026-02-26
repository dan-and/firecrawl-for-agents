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
