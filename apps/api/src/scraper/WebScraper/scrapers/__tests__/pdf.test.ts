// Mock unpdf before any imports — Jest hoists jest.mock() calls.
// This bypasses the ESM-only pdfjs.mjs bundle that cannot be loaded
// inside Jest's CJS VM sandbox.
jest.mock("unpdf");

import { getDocumentProxy, extractText } from "unpdf";
import { extractPDFText, MIN_CHARS_PER_PAGE } from "../pdf";

const mockGetDocumentProxy = getDocumentProxy as jest.MockedFunction<typeof getDocumentProxy>;
const mockExtractText = extractText as jest.MockedFunction<typeof extractText>;

// A fake PDF document proxy (the real type is opaque; a plain object works for mocking)
const fakePDFDoc = {} as Awaited<ReturnType<typeof getDocumentProxy>>;

describe("extractPDFText", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should extract text from a PDF and return hasText=true when content is sufficient", async () => {
    // 1 page, 200 chars — well above 50 chars/page threshold
    const longText = "A".repeat(200);
    mockGetDocumentProxy.mockResolvedValue(fakePDFDoc);
    mockExtractText.mockResolvedValue({ totalPages: 1, text: longText } as any);

    const result = await extractPDFText(Buffer.from("%PDF-1.4"));

    expect(result.text).toBe(longText);
    expect(result.pageCount).toBe(1);
    expect(result.hasText).toBe(true);
    expect(mockGetDocumentProxy).toHaveBeenCalledTimes(1);
    expect(mockExtractText).toHaveBeenCalledWith(fakePDFDoc, { mergePages: true });
  });

  it("should simulate a real text PDF with sufficient content per page", async () => {
    // 1 page, 100+ chars — above the 50 char/page threshold
    const sampleText = "This is a sample PDF document with sufficient text content to exceed the minimum threshold.";
    mockGetDocumentProxy.mockResolvedValue(fakePDFDoc);
    mockExtractText.mockResolvedValue({ totalPages: 1, text: sampleText } as any);

    const result = await extractPDFText(Buffer.from("%PDF-1.4"));

    expect(result.text).toContain("sample PDF document");
    expect(result.pageCount).toBe(1);
    expect(result.hasText).toBe(true); // 90 chars / 1 page ≥ 50
  });

  it("should return hasText=false when chars-per-page is below MIN_CHARS_PER_PAGE threshold", async () => {
    // 10 pages, 3 total chars → 0.3 chars/page — well below the 50-char/page threshold
    mockGetDocumentProxy.mockResolvedValue(fakePDFDoc);
    mockExtractText.mockResolvedValue({ totalPages: 10, text: "abc" } as any);

    const result = await extractPDFText(Buffer.from("%PDF-mock"));

    expect(result.pageCount).toBe(10);
    expect(result.text).toBe("abc");
    expect(result.hasText).toBe(false); // 0.3 chars/page < MIN_CHARS_PER_PAGE (50)
  });

  it("should return hasText=false when there is exactly 1 page with fewer than MIN_CHARS_PER_PAGE chars", async () => {
    // 49 chars on 1 page — just below the threshold
    mockGetDocumentProxy.mockResolvedValue(fakePDFDoc);
    mockExtractText.mockResolvedValue({ totalPages: 1, text: "A".repeat(49) } as any);

    const result = await extractPDFText(Buffer.from("%PDF-1.4"));
    expect(result.hasText).toBe(false);
  });

  it("should return hasText=true when there is exactly MIN_CHARS_PER_PAGE chars on 1 page", async () => {
    // Exactly 50 chars on 1 page — exactly at the threshold
    mockGetDocumentProxy.mockResolvedValue(fakePDFDoc);
    mockExtractText.mockResolvedValue({ totalPages: 1, text: "A".repeat(50) } as any);

    const result = await extractPDFText(Buffer.from("%PDF-1.4"));
    expect(result.hasText).toBe(true);
  });

  it("MIN_CHARS_PER_PAGE is exported and equals 50", () => {
    // Verify the threshold constant is stable so future changes are deliberate
    expect(MIN_CHARS_PER_PAGE).toBe(50);
  });

  it("should return pageCount from unpdf", async () => {
    mockGetDocumentProxy.mockResolvedValue(fakePDFDoc);
    mockExtractText.mockResolvedValue({ totalPages: 7, text: "A".repeat(700) } as any);

    const result = await extractPDFText(Buffer.from("%PDF-1.4"));
    expect(result.pageCount).toBe(7);
    expect(result.hasText).toBe(true); // 100 chars/page ≥ 50
  });

  it("should return trimmed text (no leading/trailing whitespace)", async () => {
    const textWithPadding = "  Hello PDF content  ";
    mockGetDocumentProxy.mockResolvedValue(fakePDFDoc);
    mockExtractText.mockResolvedValue({ totalPages: 1, text: textWithPadding } as any);

    const result = await extractPDFText(Buffer.from("%PDF-1.4"));
    expect(result.text).toBe("Hello PDF content");
    expect(result.text).toBe(result.text.trim());
  });

  it("should propagate errors thrown by getDocumentProxy (invalid PDF)", async () => {
    mockGetDocumentProxy.mockRejectedValue(new Error("Invalid PDF structure"));

    const notAPDF = Buffer.from("This is not a PDF file at all", "utf-8");
    await expect(extractPDFText(notAPDF)).rejects.toThrow("Invalid PDF structure");
  });

  it("should handle a 0-page PDF gracefully (charsPerPage = 0)", async () => {
    // Edge case: totalPages = 0 → charsPerPage = 0 → hasText = false
    mockGetDocumentProxy.mockResolvedValue(fakePDFDoc);
    mockExtractText.mockResolvedValue({ totalPages: 0, text: "" } as any);

    const result = await extractPDFText(Buffer.from("%PDF-1.4"));
    expect(result.pageCount).toBe(0);
    expect(result.hasText).toBe(false);
  });
});
