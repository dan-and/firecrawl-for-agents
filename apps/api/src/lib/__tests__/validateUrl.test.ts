import { isInternalHost, checkUrl, checkAndUpdateURL } from "../validateUrl";

describe("isInternalHost", () => {
  it.each([
    "localhost",
    "127.0.0.1",
    "127.1.2.3",
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "192.168.1.100",
    "169.254.169.254",   // AWS metadata
    "169.254.0.1",
    "::1",
    "[::1]",
    "redis",
    "playwright-service",
    "0.0.0.0",
  ])("blocks internal host: %s", (host) => {
    expect(isInternalHost(host)).toBe(true);
  });

  it.each([
    "example.com",
    "google.com",
    "8.8.8.8",
    "1.1.1.1",
    "104.21.0.1",
    "172.15.0.1",   // just outside RFC 1918 range
    "172.32.0.1",   // just outside RFC 1918 range
  ])("allows public host: %s", (host) => {
    expect(isInternalHost(host)).toBe(false);
  });
});

describe("checkUrl — SSRF protection", () => {
  beforeEach(() => {
    process.env.SSRF_PROTECTION_ENABLED = "true";
  });

  it("rejects internal URLs by default", () => {
    expect(() => checkUrl("http://localhost/")).toThrow("not allowed");
    expect(() => checkUrl("http://169.254.169.254/latest/meta-data/")).toThrow("not allowed");
    expect(() => checkUrl("http://redis/")).toThrow("not allowed");
    expect(() => checkUrl("http://10.0.0.1/admin")).toThrow("not allowed");
  });

  it("accepts public URLs", () => {
    expect(() => checkUrl("https://example.com")).not.toThrow();
    expect(() => checkUrl("https://google.com/path?q=1")).not.toThrow();
  });

  it("allows internal URLs when SSRF_PROTECTION_ENABLED=false", () => {
    process.env.SSRF_PROTECTION_ENABLED = "false";
    expect(() => checkUrl("http://localhost/")).not.toThrow();
  });
});

describe("checkAndUpdateURL — SSRF protection", () => {
  beforeEach(() => {
    process.env.SSRF_PROTECTION_ENABLED = "true";
  });

  it("rejects internal URLs", () => {
    expect(() => checkAndUpdateURL("http://192.168.1.1/")).toThrow("not allowed");
    expect(() => checkAndUpdateURL("http://172.20.0.1/")).toThrow("not allowed");
  });

  it("still prepends http:// to bare domains", () => {
    const result = checkAndUpdateURL("example.com");
    expect(result.url).toBe("http://example.com");
  });
});
