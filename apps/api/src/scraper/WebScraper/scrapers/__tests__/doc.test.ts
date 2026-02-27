import { isDOCUrl } from "../doc";

describe("isDOCUrl", () => {
  it("detects .doc extension", () => {
    expect(isDOCUrl("https://example.com/form.doc")).toBe(true);
  });

  it("does NOT detect .docx (handled by T2-J)", () => {
    expect(isDOCUrl("https://example.com/form.docx")).toBe(false);
  });

  it("detects application/msword content-type", () => {
    expect(isDOCUrl("https://example.com/file", "application/msword")).toBe(true);
  });

  it("returns false for PDF URLs", () => {
    expect(isDOCUrl("https://example.com/file.pdf")).toBe(false);
  });
});
