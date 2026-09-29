import { describe, expect, it } from "vitest";
import { pickSelection } from "./textarea.js";

const el = (value: string, start: number, end: number) => ({ value, selectionStart: start, selectionEnd: end });

describe("pickSelection", () => {
  it("returns the trimmed selection when there is one", () => {
    expect(pickSelection(el("hello big world", 5, 10), "hello big world")).toBe("big");
  });

  it("falls back to the whole text when short and single-line", () => {
    expect(pickSelection(el("hello", 2, 2), "  hello  ")).toBe("hello");
    expect(pickSelection(null, "hello")).toBe("hello");
  });

  it("returns nothing for multi-line, tabbed, empty or oversized text", () => {
    expect(pickSelection(null, "a\nb")).toBe("");
    expect(pickSelection(null, "a\tb")).toBe("");
    expect(pickSelection(null, "   ")).toBe("");
    expect(pickSelection(null, "x".repeat(1025))).toBe("");
  });
});
