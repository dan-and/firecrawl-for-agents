import { parseOffice } from "officeparser";
import { Logger } from "../../../lib/logger";

/**
 * Returns true if the URL or Content-Type indicates a supported office format:
 * PPTX, ODT, ODP, or RTF.
 *
 * NOTE: .ods is intentionally excluded — it is handled by isSpreadsheetUrl (T2-I).
 * NOTE: .docx and .doc are excluded — handled by T2-J and T2-K respectively.
 */
export function isOfficeUrl(url: string, contentType?: string): boolean {
  const lower = url.toLowerCase().split("?")[0];

  if (
    lower.endsWith(".pptx") ||
    lower.endsWith(".odt") ||
    lower.endsWith(".odp") ||
    lower.endsWith(".rtf")
  ) {
    return true;
  }

  if (contentType) {
    return (
      contentType.includes("presentationml") ||                  // .pptx
      contentType.includes("opendocument.presentation") ||       // .odp
      contentType.includes("opendocument.text") ||               // .odt
      contentType.includes("application/rtf") ||                 // .rtf
      contentType.includes("text/rtf")                           // .rtf (alternate)
    );
  }

  return false;
}

/**
 * Extracts plain text from a PPTX, ODT, ODP, or RTF buffer using officeparser v6.
 * Returns the text wrapped in <pre> tags so the markdown pipeline preserves formatting.
 *
 * Throws if the buffer is corrupt or unrecognised (officeparser throws IMPROPER_BUFFERS).
 * Returns "" if extraction succeeds but produces only whitespace.
 */
export async function parseOfficeBuffer(buffer: Buffer): Promise<string> {
  const ast = await parseOffice(buffer);
  const trimmed = ast.toText().trim();
  if (!trimmed) {
    Logger.debug("officeparser: extracted empty text from office file");
    return "";
  }
  // Wrap in <pre> so whitespace/line-breaks are preserved by the HTML→markdown pipeline,
  // matching the behaviour of the .doc handler (T2-K).
  return `<pre>${trimmed}</pre>`;
}
