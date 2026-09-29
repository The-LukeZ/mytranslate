import { describe, expect, it } from "vitest";
import { isSameTranslation } from "#lib/translate-history.js";

const de = (text: string) => ({ text, sourceLang: "de", targetLang: "en-US" });

describe("isSameTranslation", () => {
  it("treats typing more or deleting as the same translation", () => {
    expect(isSameTranslation(de("Hallo"), de("Hallo Welt"))).toBe(true);
    expect(isSameTranslation(de("Hallo Welt"), de("Hallo"))).toBe(true);
  });

  it("treats an edit in the middle as the same translation", () => {
    expect(isSameTranslation(de("Der Hund schläft heute"), de("Der Kater schläft heute"))).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(isSameTranslation(de("Hallo Welt"), de("  Hallo Welt\n"))).toBe(true);
  });

  it("treats unrelated text as a new translation", () => {
    expect(isSameTranslation(de("Guten Morgen"), de("Wie spät ist es?"))).toBe(false);
    expect(isSameTranslation(de("Hallo"), de(""))).toBe(false);
  });

  it("needs half of the shorter text to be shared", () => {
    // "abcd" vs "abxy": 2 of 4 shared
    expect(isSameTranslation(de("abcd"), de("abxy"))).toBe(true);
    // "abcd" vs "axyz": 1 of 4 shared
    expect(isSameTranslation(de("abcd"), de("axyz"))).toBe(false);
  });

  it("treats a language pair change as a new translation", () => {
    expect(isSameTranslation(de("Hallo"), { ...de("Hallo"), targetLang: "fr" })).toBe(false);
    expect(isSameTranslation(de("Hallo"), { ...de("Hallo"), sourceLang: "" })).toBe(false);
  });
});
