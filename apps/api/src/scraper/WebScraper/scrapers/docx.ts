import mammoth from "mammoth";
import { Logger } from "../../../lib/logger";

export function isDOCXUrl(url: string, contentType?: string): boolean {
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".docx")) return true;
  if (contentType?.includes("wordprocessingml")) return true;
  return false;
}

export async function parseDOCXBuffer(buffer: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer });
  if (result.messages.length > 0) {
    Logger.debug(`mammoth DOCX warnings: ${result.messages.map((m) => m.message).join("; ")}`);
  }
  return result.value;
}
