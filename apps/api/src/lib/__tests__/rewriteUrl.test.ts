import { rewriteUrl } from "../rewriteUrl";

describe("rewriteUrl", () => {
  describe("Google Docs", () => {
    it("rewrites a regular /edit URL to HTML export", () => {
      expect(
        rewriteUrl(
          "https://docs.google.com/document/d/1iqj3PY--4lSBpVkavEpjlayx0AHJDglOnJmHNOpFP1U/edit"
        )
      ).toBe(
        "https://docs.google.com/document/d/1iqj3PY--4lSBpVkavEpjlayx0AHJDglOnJmHNOpFP1U/export?format=html"
      );
    });

    it("rewrites a URL that already has query params", () => {
      expect(
        rewriteUrl(
          "https://docs.google.com/document/d/1iqj3PY--4lSBpVkavEpjlayx0AHJDglOnJmHNOpFP1U/edit?usp=sharing"
        )
      ).toBe(
        "https://docs.google.com/document/d/1iqj3PY--4lSBpVkavEpjlayx0AHJDglOnJmHNOpFP1U/export?format=html"
      );
    });

    it("does NOT rewrite a published doc (/d/e/ path)", () => {
      expect(
        rewriteUrl(
          "https://docs.google.com/document/d/e/2PACX-1vTZQI1NBJsuR/pub"
        )
      ).toBeUndefined();
    });

    it("rewrites http:// URLs", () => {
      expect(
        rewriteUrl(
          "http://docs.google.com/document/d/1iqj3PY--4lSBpVkavEpjlayx0AHJDglOnJmHNOpFP1U/edit"
        )
      ).toBe(
        "https://docs.google.com/document/d/1iqj3PY--4lSBpVkavEpjlayx0AHJDglOnJmHNOpFP1U/export?format=html"
      );
    });
  });

  describe("Google Slides", () => {
    it("rewrites a Slides URL to HTML export", () => {
      expect(
        rewriteUrl(
          "https://docs.google.com/presentation/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
        )
      ).toBe(
        "https://docs.google.com/presentation/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=html"
      );
    });

    it("does NOT rewrite a published Slides URL (/d/e/ path)", () => {
      expect(
        rewriteUrl(
          "https://docs.google.com/presentation/d/e/2PACX-1vSomeId/pub"
        )
      ).toBeUndefined();
    });
  });

  describe("Google Sheets", () => {
    it("rewrites a Sheets URL to HTML table export", () => {
      expect(
        rewriteUrl(
          "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
        )
      ).toBe(
        "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/gviz/tq?tqx=out:html"
      );
    });

    it("preserves gid (tab) parameter from query string", () => {
      expect(
        rewriteUrl(
          "https://docs.google.com/spreadsheets/d/1BxiMVs0/edit?gid=89683736"
        )
      ).toBe(
        "https://docs.google.com/spreadsheets/d/1BxiMVs0/gviz/tq?tqx=out:html&gid=89683736"
      );
    });

    it("preserves gid parameter from hash fragment", () => {
      expect(
        rewriteUrl(
          "https://docs.google.com/spreadsheets/d/1BxiMVs0/edit#gid=89683736"
        )
      ).toBe(
        "https://docs.google.com/spreadsheets/d/1BxiMVs0/gviz/tq?tqx=out:html&gid=89683736"
      );
    });
  });

  describe("Google Drive", () => {
    it("rewrites a Drive file URL to direct download", () => {
      expect(
        rewriteUrl(
          "https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2/view"
        )
      ).toBe(
        "https://drive.google.com/uc?export=download&id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2"
      );
    });
  });

  describe("Non-Google URLs", () => {
    it("returns undefined for regular websites", () => {
      expect(rewriteUrl("https://example.com/page")).toBeUndefined();
      expect(rewriteUrl("https://example.com/page?param=1")).toBeUndefined();
    });

    it("returns undefined for other Google services", () => {
      expect(rewriteUrl("https://mail.google.com/mail/u/0/#inbox")).toBeUndefined();
      expect(rewriteUrl("https://calendar.google.com/calendar/r")).toBeUndefined();
    });
  });
});
