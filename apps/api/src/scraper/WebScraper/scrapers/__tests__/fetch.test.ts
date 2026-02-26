// Jest auto-mocks undici when we call jest.mock. We define what each mock returns
// per test using mockResolvedValueOnce / mockRejectedValueOnce.
jest.mock("undici");

import { request } from "undici";
import { scrapeWithFetch } from "../fetch";

const mockRequest = request as jest.MockedFunction<typeof request>;

// Helper: build a fake undici response body that returns the given text
function fakeBody(text: string) {
  return { text: async () => text } as any;
}

describe("scrapeWithFetch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it("returns HTML content for a 200 response", async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      headers: {},
      body: fakeBody("<html><body><p>Hello world</p></body></html>"),
    } as any);

    const result = await scrapeWithFetch("https://example.com");

    expect(result.pageStatusCode).toBe(200);
    expect(result.content).toContain("Hello world");
    expect(result.pageError).toBeNull();
  });

  // ── Non-200 status codes ──────────────────────────────────────────────────

  it("returns empty content with pageStatusCode for a 404 response", async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 404,
      headers: {},
      body: fakeBody("Not Found"),
    } as any);

    const result = await scrapeWithFetch("https://example.com/missing");

    expect(result.pageStatusCode).toBe(404);
    expect(result.content).toBe("");
    expect(result.pageError).toContain("404");
  });

  it("returns empty content for a 403 response", async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 403,
      headers: {},
      body: fakeBody("Forbidden"),
    } as any);

    const result = await scrapeWithFetch("https://example.com/protected");

    expect(result.pageStatusCode).toBe(403);
    expect(result.content).toBe("");
  });

  it("returns empty content for a 500 response", async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 500,
      headers: {},
      body: fakeBody("Internal Server Error"),
    } as any);

    const result = await scrapeWithFetch("https://broken.example.com");

    expect(result.pageStatusCode).toBe(500);
    expect(result.content).toBe("");
  });

  // ── PDF detection ─────────────────────────────────────────────────────────

  it("returns empty content when response starts with %PDF-", async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      headers: {},
      body: fakeBody("%PDF-1.4 binary content here\nobj\nendobj"),
    } as any);

    const result = await scrapeWithFetch("https://example.com/doc.pdf");

    expect(result.content).toBe("");
    expect(result.pageError).toContain("PDF");
  });

  // ── Timeout errors ────────────────────────────────────────────────────────

  it("returns 'Request timed out' on UND_ERR_HEADERS_TIMEOUT", async () => {
    const err = Object.assign(new Error("Headers timeout"), {
      code: "UND_ERR_HEADERS_TIMEOUT",
    });
    mockRequest.mockRejectedValueOnce(err);

    const result = await scrapeWithFetch("https://slow.example.com");

    expect(result.content).toBe("");
    expect(result.pageError).toBe("Request timed out");
    expect(result.pageStatusCode).toBeNull();
  });

  it("returns 'Request timed out' on UND_ERR_BODY_TIMEOUT", async () => {
    const err = Object.assign(new Error("Body timeout"), {
      code: "UND_ERR_BODY_TIMEOUT",
    });
    mockRequest.mockRejectedValueOnce(err);

    const result = await scrapeWithFetch("https://slow.example.com");

    expect(result.content).toBe("");
    expect(result.pageError).toBe("Request timed out");
  });

  it("returns 'Request timed out' on legacy ECONNABORTED code", async () => {
    const err = Object.assign(new Error("socket hang up"), {
      code: "ECONNABORTED",
    });
    mockRequest.mockRejectedValueOnce(err);

    const result = await scrapeWithFetch("https://slow.example.com");

    expect(result.content).toBe("");
    expect(result.pageError).toBe("Request timed out");
  });

  // ── Network / DNS errors ──────────────────────────────────────────────────

  it("returns empty content and error message on network error", async () => {
    mockRequest.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND nonexistent.example.com"));

    const result = await scrapeWithFetch("https://nonexistent.example.com");

    expect(result.content).toBe("");
    expect(result.pageError).toBeDefined();
    expect(result.pageStatusCode).toBeNull();
  });
});
