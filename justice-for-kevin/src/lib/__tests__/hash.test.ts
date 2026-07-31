import { describe, expect, it } from "vitest";
import { sha256Hex, sha256HexOfText } from "@/lib/hash";

describe("sha256", () => {
  it("matches the known digest of 'abc'", async () => {
    expect(await sha256HexOfText("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("hashes empty input to the SHA-256 empty digest", async () => {
    expect(await sha256Hex(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
  it("is stable for byte arrays with offsets", async () => {
    const buffer = new Uint8Array([0, 97, 98, 99, 0]);
    const view = buffer.subarray(1, 4); // "abc"
    expect(await sha256Hex(view)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
