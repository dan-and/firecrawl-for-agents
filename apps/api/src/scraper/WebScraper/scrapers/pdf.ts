import { extractText, getDocumentProxy } from "unpdf";

/**
 * Minimum extracted characters per page to consider the PDF as having
 * real text content. Below this threshold the page is likely a scan/image.
 */
export const MIN_CHARS_PER_PAGE = 50;

export interface PDFExtractionResult {
  /** The full extracted text, all pages joined. Empty string if nothing found. */
  text: string;
  /** Total number of pages in the PDF. */
  pageCount: number;
  /**
   * true  → PDF has enough text to return to the caller.
   * false → PDF is likely a scan; an OCR sidecar would be needed for content.
   */
  hasText: boolean;
}

/**
 * Extracts plain text from a PDF supplied as a Node.js Buffer.
 *
 * @param buffer - Raw binary PDF data (e.g. from undici with body.bytes())
 * @returns PDFExtractionResult
 * @throws If the buffer is not a valid PDF, unpdf will throw. Callers must handle errors.
 */
export async function extractPDFText(
  buffer: Buffer
): Promise<PDFExtractionResult> {
  const uint8 = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(uint8);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });

  const charsPerPage = totalPages > 0 ? text.length / totalPages : 0;

  return {
    text: text.trim(),
    pageCount: totalPages,
    hasText: charsPerPage >= MIN_CHARS_PER_PAGE,
  };
}
