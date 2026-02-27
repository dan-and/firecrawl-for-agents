import { isDOCXUrl } from "../docx";

describe("isDOCXUrl", () => {
  it("detects .docx extension", () => {
    expect(isDOCXUrl("https://example.com/report.docx")).toBe(true);
  });

  it("detects wordprocessingml content-type", () => {
    expect(isDOCXUrl("https://example.com/file", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
  });

  it("returns false for .pdf", () => {
    expect(isDOCXUrl("https://example.com/report.pdf")).toBe(false);
  });

  it("returns false for HTML URLs", () => {
    expect(isDOCXUrl("https://example.com/page")).toBe(false);
  });
});
