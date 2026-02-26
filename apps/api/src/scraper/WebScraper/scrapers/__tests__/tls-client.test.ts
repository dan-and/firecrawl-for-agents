const mockCycleTLSCaller = jest.fn();

jest.mock("cycletls", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(mockCycleTLSCaller),
}));

import { scrapeWithTlsClient } from "../tls-client";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("scrapeWithTlsClient", () => {
  it("returns HTML content for a 200 response", async () => {
    mockCycleTLSCaller.mockResolvedValueOnce({
      status: 200,
      data: "<html><body><p>Hello TLS world</p></body></html>",
      headers: {},
    });

    const result = await scrapeWithTlsClient("https://example.com");

    expect(result.pageStatusCode).toBe(200);
    expect(result.content).toContain("Hello TLS world");
    expect(result.pageError).toBeNull();
  });

  it("returns empty content for a 403 response", async () => {
    mockCycleTLSCaller.mockResolvedValueOnce({
      status: 403,
      data: "Forbidden",
      headers: {},
    });

    const result = await scrapeWithTlsClient("https://blocked.example.com");

    expect(result.pageStatusCode).toBe(403);
    expect(result.content).toBe("");
    expect(result.pageError).toContain("403");
  });

  it("returns empty content for a 503 response", async () => {
    mockCycleTLSCaller.mockResolvedValueOnce({
      status: 503,
      data: "Service Unavailable",
      headers: {},
    });

    const result = await scrapeWithTlsClient("https://down.example.com");

    expect(result.pageStatusCode).toBe(503);
    expect(result.content).toBe("");
  });

  it("returns empty content and error message when CycleTLS throws", async () => {
    mockCycleTLSCaller.mockRejectedValueOnce(
      new Error("Connection refused")
    );

    const result = await scrapeWithTlsClient(
      "https://unreachable.example.com"
    );

    expect(result.content).toBe("");
    expect(result.pageStatusCode).toBeNull();
    expect(result.pageError).toContain("Connection refused");
  });

  it("returns empty content and error message when CycleTLS throws a non-Error", async () => {
    mockCycleTLSCaller.mockRejectedValueOnce("timeout");

    const result = await scrapeWithTlsClient("https://slow.example.com");

    expect(result.content).toBe("");
    expect(result.pageError).toBeDefined();
  });
});

describe("tls-client env var gate", () => {
  it("tls-client is excluded from fallback order when TLS_CLIENT_ENABLED is not set", () => {
    delete process.env.TLS_CLIENT_ENABLED;

    const baseScrapers = ["playwright", "fetch", "tls-client"];
    const available = baseScrapers.filter((scraper) => {
      if (scraper === "playwright")
        return !!process.env.PLAYWRIGHT_MICROSERVICE_URL;
      if (scraper === "tls-client")
        return process.env.TLS_CLIENT_ENABLED === "true";
      return true;
    });

    expect(available).not.toContain("tls-client");
    expect(available).toContain("fetch");
  });

  it("tls-client is included in fallback order when TLS_CLIENT_ENABLED=true", () => {
    process.env.TLS_CLIENT_ENABLED = "true";

    const baseScrapers = ["playwright", "fetch", "tls-client"];
    const available = baseScrapers.filter((scraper) => {
      if (scraper === "playwright")
        return !!process.env.PLAYWRIGHT_MICROSERVICE_URL;
      if (scraper === "tls-client")
        return process.env.TLS_CLIENT_ENABLED === "true";
      return true;
    });

    expect(available).toContain("tls-client");

    delete process.env.TLS_CLIENT_ENABLED;
  });
});
