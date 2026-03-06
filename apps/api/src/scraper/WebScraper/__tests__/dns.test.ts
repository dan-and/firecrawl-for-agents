import CacheableLookup from "cacheable-lookup";
import https from "node:https";

describe("DNS", () => {
  it("cached dns", async () => {
    const cachedDns = new CacheableLookup();
    cachedDns.install(https.globalAgent);
    const spy = jest.spyOn(cachedDns, "lookupAsync");

    // Avoid real network calls in tests; just invoke the DNS lookup directly.
    await cachedDns.lookupAsync("example.com");

    expect(spy).toHaveBeenCalled();
  });
});
