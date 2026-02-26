import { Logger } from "../../../../../src/lib/logger";
import { describe, it, expect, beforeEach } from "@jest/globals";
import { initEngineForcing, getForcedEngine } from "../engine-forcing";

describe("engine-forcing", () => {

  it("getForcedEngine returns null if no env var is set", () => {
    const engine = getForcedEngine("https://example.com");
    expect(engine).toBeNull();
  });

  it("getForcedEngine returns null if JSON parsing fails", () => {
    process.env.FORCED_ENGINE_DOMAINS = "{ invalid json";
    const engine = getForcedEngine("https://example.com");
    expect(engine).toBeNull();
  });

  it("getForcedEngine returns null if no match found", () => {
    process.env.FORCED_ENGINE_DOMAINS = '{"example.com":"fetch"}';
    const engine = getForcedEngine("https://other.com");
    expect(engine).toBeNull();
  });

  it("getForcedEngine matches exact domain", () => {
    process.env.FORCED_ENGINE_DOMAINS = '{"example.com":"playwright"}';
    initEngineForcing();
    const engine = getForcedEngine("https://example.com/path");
    expect(engine).toBe("playwright");
  });

  it("getForcedEngine matches subdomain with wildcard pattern", () => {
    process.env.FORCED_ENGINE_DOMAINS = '{"*.api.example.com":"fetch"}';
    initEngineForcing();
    const engine = getForcedEngine("https://sub.api.example.com/path");
    expect(engine).toBe("fetch");
  });

  it("getForcedEngine matches subdomain with wildcard and port", () => {
    process.env.FORCED_ENGINE_DOMAINS = '{"*.api.example.com":"fetch"}';
    initEngineForcing();
    const engine = getForcedEngine("https://sub.api.example.com:8080/path");
    expect(engine).toBe("fetch");
  });

  it("getForcedEngine matches www subdomain when pattern is *.example.com", () => {
    process.env.FORCED_ENGINE_DOMAINS = '{"*.example.com":"playwright"}';
    initEngineForcing();
    const engine = getForcedEngine("https://www.example.com/path");
    expect(engine).toBe("playwright");
  });

  it("getForcedEngine returns specified engine", () => {
    process.env.FORCED_ENGINE_DOMAINS = '{"example.com":"tls-client"}';
    initEngineForcing();
    const engine = getForcedEngine("https://example.com");
    expect(engine).toBe("tls-client");
  });

  it("initEngineForcing parses valid JSON from env var", () => {
    process.env.FORCED_ENGINE_DOMAINS = '{"example.com":"fetch","*.test.com":"playwright"}';
    initEngineForcing();
    const engine1 = getForcedEngine("https://example.com");
    const engine2 = getForcedEngine("https://sub.test.com");
    expect(engine1).toBe("fetch");
    expect(engine2).toBe("playwright");
  });

  it("initEngineForcing handles multiple patterns for same domain", () => {
    process.env.FORCED_ENGINE_DOMAINS = '{"example.com":"playwright","*.example.com":"fetch"}';
    initEngineForcing();
    const engine1 = getForcedEngine("https://example.com");
    const engine2 = getForcedEngine("https://sub.example.com");
    expect(engine1).toBe("playwright");
    expect(engine2).toBe("fetch");
  });

  it("getForcedEngine handles invalid URLs gracefully", () => {
    process.env.FORCED_ENGINE_DOMAINS = '{"example.com":"fetch"}';
    const engine = getForcedEngine("not-a-valid-url");
    expect(engine).toBeNull();
  });
});
