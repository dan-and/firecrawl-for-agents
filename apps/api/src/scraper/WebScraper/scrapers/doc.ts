import WordExtractor from "word-extractor";
import { Logger } from "../../../lib/logger";

export function isDOCUrl(url: string, contentType?: string): boolean {
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".doc") && !lower.endsWith(".docx")) return true;
  if (contentType === "application/msword") return true;
  return false;
}

export async function parseDOCBuffer(buffer: Buffer): Promise<string> {
  const extractor = new WordExtractor();
  const doc = await extractor.extract(buffer);
  const body = doc.getBody();
  if (!body || body.trim().length === 0) {
    Logger.debug("word-extractor: no body text found in .doc file");
    return "";
  }
  return body;
}
