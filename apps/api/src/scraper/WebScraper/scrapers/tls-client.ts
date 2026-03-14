import initCycleTLS from "cycletls";
import * as zlib from "zlib";
import { Logger } from "../../../lib/logger";

const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);

function getContentEncoding(
  headers: Record<string, string> | undefined
): string | null {
  if (!headers || typeof headers !== "object") return null;
  const key = Object.keys(headers).find(
    (k) => k.toLowerCase() === "content-encoding"
  );
  if (!key) return null;
  const v = headers[key];
  return typeof v === "string" ? v.trim().toLowerCase().split(",")[0] : null;
}

function decompressBody(
  data: string | Buffer,
  encoding: string | null
): string {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "binary");
  if (buf.length === 0) return "";

  let decoded: Buffer;
  try {
    if (encoding === "gzip" || encoding === "deflate" || encoding === "br") {
      if (encoding === "gzip") {
        decoded = zlib.gunzipSync(buf);
      } else if (encoding === "deflate") {
        decoded = zlib.inflateRawSync(buf);
      } else {
        decoded = zlib.brotliDecompressSync(buf);
      }
    } else if (encoding === null && buf.length >= 2 && buf[0] === GZIP_MAGIC[0] && buf[1] === GZIP_MAGIC[1]) {
      decoded = zlib.gunzipSync(buf);
    } else {
      return buf.toString("utf8");
    }
  } catch {
    return buf.toString("utf8");
  }
  return decoded.toString("utf8");
}

let _instance: Awaited<ReturnType<typeof initCycleTLS>> | null = null;

async function getInstance() {
  if (!_instance) {
    _instance = await initCycleTLS();
  }
  return _instance;
}

const CHROME_JA3 =
  "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0";

const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrapeWithTlsClient(
  url: string
): Promise<{ content: string; pageStatusCode?: number; pageError?: string }> {
  const startTime = Date.now();

  try {
    const cycleTLS = await getInstance();

    const response = await cycleTLS(
      url,
      {
        ja3: CHROME_JA3,
        userAgent: CHROME_USER_AGENT,
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          "accept-encoding": "gzip, deflate, br",
        },
        timeout: 60,
        disableRedirect: false,
      },
      "get"
    );

    if (response.status !== 200) {
      Logger.debug(
        `⛏️ tls-client: Failed to fetch url: ${url} with status: ${response.status}`
      );
      return {
        content: "",
        pageStatusCode: response.status,
        pageError: `HTTP ${response.status}`,
      };
    }

    Logger.debug(
      `⛏️ tls-client: Successfully fetched ${url} in ${Date.now() - startTime}ms`
    );
    const raw = response.data ?? "";
    const encoding = getContentEncoding(response.headers);
    const content = decompressBody(raw, encoding);
    return {
      content,
      pageStatusCode: response.status,
      pageError: null,
    };
  } catch (error) {
    Logger.debug(
      `⛏️ tls-client: Failed to fetch url: ${url} | Error: ${error}`
    );
    return {
      content: "",
      pageStatusCode: null,
      pageError: error.message || String(error),
    };
  }
}

export async function shutdownTlsClient() {
  if (_instance) {
    try {
      await (_instance as any).exit();
    } catch (_) {
    }
    _instance = null;
  }
}
