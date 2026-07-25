import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizePlate,
  normalizeUrl,
  normalizeUsername,
} from "@/lib/normalize";

describe("normalizePhone", () => {
  it("normalizes 10-digit US numbers to E.164", () => {
    expect(normalizePhone("(925) 481-8147")).toBe("+19254818147");
    expect(normalizePhone("925.481.8147")).toBe("+19254818147");
  });
  it("handles a leading 1", () => {
    expect(normalizePhone("1-925-481-8147")).toBe("+19254818147");
  });
  it("returns empty for no digits", () => {
    expect(normalizePhone("n/a")).toBe("");
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  JCox@AntiochCA.gov ")).toBe("jcox@antiochca.gov");
  });
});

describe("normalizeUsername", () => {
  it("strips @ and lowercases", () => {
    expect(normalizeUsername("@Some_User")).toBe("some_user");
  });
  it("extracts from profile URLs", () => {
    expect(normalizeUsername("https://instagram.com/Some_User/")).toBe("some_user");
  });
});

describe("normalizeName", () => {
  it("collapses whitespace and strips punctuation", () => {
    expect(normalizeName("  O'Brien,   JOHN ")).toBe("obrien john");
  });
});

describe("normalizePlate", () => {
  it("keeps only uppercase alphanumerics", () => {
    expect(normalizePlate("8abc-123 ")).toBe("8ABC123");
  });
});

describe("normalizeUrl", () => {
  it("drops tracking params and fragments", () => {
    expect(normalizeUrl("https://Example.com/page?utm_source=x&id=2#top")).toBe(
      "https://example.com/page?id=2",
    );
  });
  it("returns input for garbage", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
  });
});
