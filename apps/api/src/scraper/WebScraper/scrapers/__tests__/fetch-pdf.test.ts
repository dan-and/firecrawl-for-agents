// Mock undici — same pattern as fetch.test.ts
jest.mock("undici");
jest.mock("../pdf");

import { request } from "undici";
import { extractPDFText } from "../pdf";
import { scrapeWithFetch } from "../fetch";

const mockRequest = request as jest.MockedFunction<typeof request>;
const mockExtractPDFText = extractPDFText as jest.MockedFunction<typeof extractPDFText>;

function fakeBody(text: string) {
  return { text: async () => text, bytes: async () => Buffer.from(text) } as any;
}

function fakeBytesBody(buf: Buffer) {
  return { text: async () => buf.toString(), bytes: async () => buf } as any;
}

describe("scrapeWithFetch — PDF handling (T3-B)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("extracts text from a PDF URL when parsePDF=true (default)", async () => {
    // First request: returns text body that triggers isPDFContent
    mockRequest
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: { "content-type": "application/pdf" },
        body: fakeBody("%PDF-1.4 fake"),
      } as any)
      // Second request: the binary re-fetch
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: fakeBytesBody(Buffer.from("%PDF-binary")),
      } as any);

    mockExtractPDFText.mockResolvedValue({
      text: "Dummy PDF file",
      pageCount: 1,
      hasText: true,
    });

    const result = await scrapeWithFetch("https://example.com/doc.pdf", true);

    expect(result.content).toBe("Dummy PDF file");
    expect(result.pageStatusCode).toBe(200);
    expect(result.pageError).toBeNull();
    // Two requests: one for HTML detection, one for binary re-fetch
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("detects PDF by content-type header (not just body signature)", async () => {
    // Content-Type is application/pdf but body doesn't start with %PDF-
    mockRequest
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: { "content-type": "application/pdf; charset=binary" },
        body: fakeBody("binary-pdf-data"),
      } as any)
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: fakeBytesBody(Buffer.from("pdf-bytes")),
      } as any);

    mockExtractPDFText.mockResolvedValue({
      text: "Extracted content from content-type-detected PDF",
      pageCount: 3,
      hasText: true,
    });

    const result = await scrapeWithFetch("https://example.com/doc", true);

    expect(result.content).toBe("Extracted content from content-type-detected PDF");
    expect(result.pageError).toBeNull();
    expect(mockExtractPDFText).toHaveBeenCalledTimes(1);
  });

  it("returns empty content when parsePDF=false", async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      headers: { "content-type": "application/pdf" },
      body: fakeBody("%PDF-1.4 fake"),
    } as any);

    const result = await scrapeWithFetch("https://example.com/doc.pdf", false);

    expect(result.content).toBe("");
    expect(result.pageError).toMatch(/parsePDF=false/);
    // Only one request — no re-fetch when parsePDF=false
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockExtractPDFText).not.toHaveBeenCalled();
  });

  it("returns graceful error message for scanned PDF (hasText=false)", async () => {
    mockRequest
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: { "content-type": "application/pdf" },
        body: fakeBody("%PDF-1.4 scan"),
      } as any)
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: fakeBytesBody(Buffer.from("%PDF-scan")),
      } as any);

    mockExtractPDFText.mockResolvedValue({
      text: "",
      pageCount: 5,
      hasText: false,
    });

    const result = await scrapeWithFetch("https://example.com/scan.pdf", true);

    expect(result.content).toBe("");
    expect(result.pageError).toMatch(/scanned image/i);
    expect(result.pageError).toMatch(/OCR/i);
  });

  it("returns error message when PDF extraction throws", async () => {
    mockRequest
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: { "content-type": "application/pdf" },
        body: fakeBody("%PDF-1.4 corrupt"),
      } as any)
      .mockResolvedValueOnce({
        statusCode: 200,
        headers: {},
        body: fakeBytesBody(Buffer.from("corrupt")),
      } as any);

    mockExtractPDFText.mockRejectedValue(new Error("Invalid PDF structure"));

    const result = await scrapeWithFetch("https://example.com/corrupt.pdf", true);

    expect(result.content).toBe("");
    expect(result.pageError).toMatch(/PDF extraction failed/i);
    expect(result.pageError).toMatch(/Invalid PDF structure/);
  });

  it("passes through normal HTML pages without touching PDF logic", async () => {
    mockRequest.mockResolvedValueOnce({
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: fakeBody("<html><body><p>Hello world</p></body></html>"),
    } as any);

    const result = await scrapeWithFetch("https://example.com/page", true);

    expect(result.content).toBe("<html><body><p>Hello world</p></body></html>");
    expect(result.pageStatusCode).toBe(200);
    // extractPDFText should never be called for HTML pages
    expect(mockExtractPDFText).not.toHaveBeenCalled();
    // Only one request — no re-fetch for HTML
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});
