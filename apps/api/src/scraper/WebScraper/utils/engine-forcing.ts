import { Logger } from "../../../lib/logger";

type EngineName = "fetch" | "playwright" | "tls-client";

let forceMap: Record<string, EngineName> = {};

export function initEngineForcing(): void {
  const raw = process.env.FORCED_ENGINE_DOMAINS;
  if (raw) {
    try {
      forceMap = JSON.parse(raw);
    } catch (e) {
      console.error("Invalid FORCED_ENGINE_DOMAINS JSON", e);
    }
  }
}

export function getForcedEngine(url: string): EngineName | null {
  try {
    const hostname = new URL(url).hostname;
    for (const [pattern, engine] of Object.entries(forceMap)) {
      if (pattern.startsWith("*.")) {
        const suffix = pattern.slice(1);
        if (hostname.endsWith(suffix)) return engine;
      } else if (pattern === hostname) {
        return engine;
      }
    }
  } catch (error) {
    Logger.error(`Error parsing URL for engine forcing: ${error}`);
  }
  return null;
}
