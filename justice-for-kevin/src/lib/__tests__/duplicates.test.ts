import { describe, expect, it } from "vitest";
import { isDuplicateSuggestion, scoreDuplicate, trigramSimilarity } from "@/lib/duplicates";

describe("scoreDuplicate", () => {
  it("flags identical normalized phone numbers", () => {
    const score = scoreDuplicate(
      { phones: ["(925) 555-0100"] },
      { phones: ["9255550100"] },
    );
    expect(score.reasons).toContain("phone_match");
    expect(isDuplicateSuggestion(score)).toBe(true);
  });

  it("flags identical file hashes strongly", () => {
    const hash = "f".repeat(64);
    const score = scoreDuplicate({ fileHashes: [hash] }, { fileHashes: [hash.toUpperCase()] });
    expect(score.reasons).toContain("file_hash_match");
    expect(score.score).toBeGreaterThan(0.9);
  });

  it("does not suggest for a lone weak name signal below threshold combos", () => {
    const score = scoreDuplicate({ names: ["completely different"] }, { names: ["nothing alike"] });
    expect(score.reasons).toHaveLength(0);
    expect(isDuplicateSuggestion(score)).toBe(false);
  });

  it("treats matching usernames from URLs and handles as equal", () => {
    const score = scoreDuplicate(
      { usernames: ["https://instagram.com/Some_User/"] },
      { usernames: ["@some_user"] },
    );
    expect(score.reasons).toContain("username_match");
  });

  it("combines signals with noisy-or, never exceeding 1", () => {
    const hash = "e".repeat(64);
    const score = scoreDuplicate(
      { phones: ["9255550100"], emails: ["a@b.co"], fileHashes: [hash] },
      { phones: ["9255550100"], emails: ["a@b.co"], fileHashes: [hash] },
    );
    expect(score.score).toBeLessThanOrEqual(1);
    expect(score.score).toBeGreaterThan(0.99);
  });
});

describe("trigramSimilarity", () => {
  it("is 1 for identical strings", () => {
    expect(trigramSimilarity("white sedan", "White  Sedan!")).toBe(1);
  });
  it("is high for near-identical narratives", () => {
    expect(
      trigramSimilarity(
        "I saw a person near Wilbur Avenue on July 11",
        "I saw a person near Wilbur Avenue on July 11.",
      ),
    ).toBeGreaterThan(0.8);
  });
  it("is low for unrelated strings", () => {
    expect(trigramSimilarity("white sedan", "blue pickup truck")).toBeLessThan(0.3);
  });
});
