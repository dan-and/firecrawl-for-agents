import { cleanContent } from "../cleanContent";

describe("cleanContent", () => {
  it("returns original markdown when OPENAI_API_KEY is not set", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const input = "# Hello\n\nThis is the content.";
    const result = await cleanContent(input, "https://example.com");
    expect(result).toBe(input);

    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
  });
});
