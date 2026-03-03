import { isOfficeUrl, parseOfficeBuffer } from "../office";

describe("isOfficeUrl — URL detection", () => {
  // Formats this module handles
  it("detects .pptx extension", () => {
    expect(isOfficeUrl("https://example.com/slides.pptx")).toBe(true);
  });
  it("detects .odt extension", () => {
    expect(isOfficeUrl("https://example.com/report.odt")).toBe(true);
  });
  it("detects .odp extension", () => {
    expect(isOfficeUrl("https://example.com/deck.odp")).toBe(true);
  });
  it("detects .rtf extension", () => {
    expect(isOfficeUrl("https://example.com/letter.rtf")).toBe(true);
  });
  it("detects PPTX MIME type", () => {
    expect(isOfficeUrl(
      "https://example.com/file",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )).toBe(true);
  });
  it("detects ODP MIME type", () => {
    expect(isOfficeUrl(
      "https://example.com/file",
      "application/vnd.oasis.opendocument.presentation"
    )).toBe(true);
  });
  it("detects RTF MIME type", () => {
    expect(isOfficeUrl("https://example.com/file", "application/rtf")).toBe(true);
  });
  it("ignores query strings in URL", () => {
    expect(isOfficeUrl("https://example.com/deck.pptx?token=abc")).toBe(true);
  });

  // Formats that must NOT be matched (handled by other modules)
  it("does NOT detect .ods (handled by T2-I / SheetJS)", () => {
    expect(isOfficeUrl("https://example.com/sheet.ods")).toBe(false);
  });
  it("does NOT detect .docx (handled by T2-J / mammoth)", () => {
    expect(isOfficeUrl("https://example.com/report.docx")).toBe(false);
  });
  it("does NOT detect .doc (handled by T2-K / word-extractor)", () => {
    expect(isOfficeUrl("https://example.com/form.doc")).toBe(false);
  });
  it("does NOT detect plain HTML URLs", () => {
    expect(isOfficeUrl("https://example.com/page.html")).toBe(false);
  });
  it("does NOT detect PDF URLs", () => {
    expect(isOfficeUrl("https://example.com/file.pdf")).toBe(false);
  });
});

describe("parseOfficeBuffer — error handling", () => {
  it("throws on clearly invalid (non-office) buffer", async () => {
    const notAnOfficeFile = Buffer.from("this is just plain text, not a real office file");
    // officeparser will reject it — we verify it throws rather than silently returning garbage
    await expect(parseOfficeBuffer(notAnOfficeFile)).rejects.toThrow();
  });
});
