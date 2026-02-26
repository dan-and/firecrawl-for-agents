import * as fetchModule from "../scrapers/fetch";
import * as playwrightModule from "../scrapers/playwright";

jest.mock("../scrapers/fetch");
jest.mock("../scrapers/playwright");

import { PageOptions } from "../../../lib/entities";

describe("T1-V — proxy parameter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it("PageOptions type accepts proxy field", () => {
    const opts: PageOptions = {
      proxy: "basic",
      includeMarkdown: false,
    };
    expect(opts.proxy).toBe("basic");
  });

  it("PageOptions type accepts stealth proxy", () => {
    const opts: PageOptions = {
      proxy: "stealth",
      includeMarkdown: false,
    };
    expect(opts.proxy).toBe("stealth");
  });

  it("PageOptions type accepts enhanced proxy", () => {
    const opts: PageOptions = {
      proxy: "enhanced",
      includeMarkdown: false,
    };
    expect(opts.proxy).toBe("enhanced");
  });
});
