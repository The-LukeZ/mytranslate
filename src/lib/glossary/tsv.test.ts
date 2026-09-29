import { describe, expect, it } from "vitest";
import { MAX_TERM_BYTES, parseTsv, serializeTsv, trimEntries, utf8Bytes, validateEntries } from "#lib/glossary/tsv.js";

describe("utf8Bytes", () => {
  it("counts bytes rather than characters", () => {
    expect(utf8Bytes("")).toBe(0);
    expect(utf8Bytes("abc")).toBe(3);
    expect(utf8Bytes("ä")).toBe(2);
    expect(utf8Bytes("€")).toBe(3);
    expect(utf8Bytes("😀")).toBe(4);
    expect(utf8Bytes("ä".repeat(513))).toBe(1026);
  });
});

describe("parseTsv", () => {
  it("parses source and target per line", () => {
    expect(parseTsv("Haus\thouse\nKatze\tcat")).toEqual([
      { source: "Haus", target: "house" },
      { source: "Katze", target: "cat" },
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseTsv("a\tb\r\nc\td\r\n")).toEqual([
      { source: "a", target: "b" },
      { source: "c", target: "d" },
    ]);
  });

  it("skips blank and whitespace-only lines", () => {
    expect(parseTsv("\n\na\tb\n   \n\t\nc\td\n")).toEqual([
      { source: "a", target: "b" },
      { source: "c", target: "d" },
    ]);
  });

  it("skips lines without a tab", () => {
    expect(parseTsv("no tab here\na\tb\nalso none")).toEqual([{ source: "a", target: "b" }]);
  });

  it("trims both sides and keeps extra tabs in the target", () => {
    expect(parseTsv("  a  \t  b\tc  ")).toEqual([{ source: "a", target: "b\tc" }]);
  });

  it("returns an empty list for empty input", () => {
    expect(parseTsv("")).toEqual([]);
  });
});

describe("serializeTsv", () => {
  it("sorts by source and trims", () => {
    expect(
      serializeTsv([
        { source: "b ", target: " 2" },
        { source: "a", target: "1" },
        { source: "c", target: "3" },
      ]),
    ).toBe("a\t1\nb\t2\nc\t3");
  });

  it("breaks ties on target", () => {
    expect(
      serializeTsv([
        { source: "a", target: "z" },
        { source: "a", target: "y" },
      ]),
    ).toBe("a\ty\na\tz");
  });

  it("keeps input order when sort is disabled", () => {
    expect(
      serializeTsv(
        [
          { source: "b", target: "2" },
          { source: "a", target: "1" },
        ],
        { sort: false },
      ),
    ).toBe("b\t2\na\t1");
  });

  it("does not mutate its input", () => {
    const input = [
      { source: "b", target: "2" },
      { source: "a", target: "1" },
    ];
    serializeTsv(input);
    expect(input.map((e) => e.source)).toEqual(["b", "a"]);
  });

  it("returns an empty string for no entries", () => {
    expect(serializeTsv([])).toBe("");
  });

  it("round-trips through parseTsv, sorted by source", () => {
    const entries = [
      { source: "zebra", target: "Zebra" },
      { source: "apple", target: "Apfel" },
      { source: "mango", target: "Mango" },
    ];
    const parsed = parseTsv(serializeTsv(entries));
    expect(parsed).toEqual([
      { source: "apple", target: "Apfel" },
      { source: "mango", target: "Mango" },
      { source: "zebra", target: "Zebra" },
    ]);
    expect(serializeTsv(parsed)).toBe(serializeTsv(entries));
  });
});

describe("trimEntries", () => {
  it("trims both sides of every entry", () => {
    expect(trimEntries([{ source: " a ", target: "\tb\n" }])).toEqual([{ source: "a", target: "b" }]);
  });
});

describe("validateEntries", () => {
  it("returns no issues for valid entries", () => {
    expect(
      validateEntries([
        { source: "a", target: "b" },
        { source: "c", target: "d" },
      ]),
    ).toEqual([]);
  });

  it("flags empty source and target, including whitespace-only", () => {
    const issues = validateEntries([
      { source: "", target: "b" },
      { source: "a", target: "   " },
    ]);
    expect(issues).toMatchObject([
      { row: 0, field: "source", kind: "empty" },
      { row: 1, field: "target", kind: "empty" },
    ]);
  });

  it("flags leading and trailing whitespace", () => {
    const issues = validateEntries([
      { source: " a", target: "b" },
      { source: "c", target: "d " },
    ]);
    expect(issues).toMatchObject([
      { row: 0, field: "source", kind: "whitespace" },
      { row: 1, field: "target", kind: "whitespace" },
    ]);
  });

  it("flags tabs and line breaks inside a term as control", () => {
    const issues = validateEntries([
      { source: "a\tb", target: "x" },
      { source: "c", target: "y\nz" },
      { source: "d", target: "y\rz" },
    ]);
    expect(issues).toMatchObject([
      { row: 0, field: "source", kind: "control" },
      { row: 1, field: "target", kind: "control" },
      { row: 2, field: "target", kind: "control" },
    ]);
  });

  it("reports a trailing newline as control, not whitespace", () => {
    expect(validateEntries([{ source: "a\n", target: "b" }])).toMatchObject([{ kind: "control" }]);
  });

  it("measures the length limit in UTF-8 bytes", () => {
    const fitsInChars = "ä".repeat(513); // 513 chars, 1026 bytes
    expect(fitsInChars.length).toBeLessThan(MAX_TERM_BYTES);
    expect(utf8Bytes(fitsInChars)).toBeGreaterThan(MAX_TERM_BYTES);

    const issues = validateEntries([{ source: fitsInChars, target: "ok" }]);
    expect(issues).toMatchObject([{ row: 0, field: "source", kind: "too_long" }]);
  });

  it("accepts terms of exactly the maximum size and rejects one byte more", () => {
    const exact = "ä".repeat(512); // 1024 bytes
    expect(validateEntries([{ source: "a", target: exact }])).toEqual([]);
    const over = "a" + exact; // 1025 bytes
    expect(validateEntries([{ source: "a", target: over }])).toMatchObject([
      { row: 0, field: "target", kind: "too_long" },
    ]);
  });

  it("reports a duplicate source on the second row", () => {
    const issues = validateEntries([
      { source: "a", target: "1" },
      { source: "b", target: "2" },
      { source: "a", target: "3" },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ row: 2, field: "source", kind: "duplicate" });
    expect(issues[0]?.message).toContain("row 1");
  });

  it("reports every later occurrence of a duplicate against the first row", () => {
    const issues = validateEntries([
      { source: "a", target: "1" },
      { source: "a", target: "2" },
      { source: "a", target: "3" },
    ]);
    expect(issues.map((i) => [i.row, i.kind])).toEqual([
      [1, "duplicate"],
      [2, "duplicate"],
    ]);
    expect(issues.every((i) => i.message.includes("row 1"))).toBe(true);
  });

  it("treats sources differing only by surrounding whitespace as duplicates", () => {
    const issues = validateEntries([
      { source: "a", target: "1" },
      { source: "a ", target: "2" },
    ]);
    expect(issues.map((i) => [i.row, i.kind])).toEqual([
      [1, "whitespace"],
      [1, "duplicate"],
    ]);
  });

  it("does not treat empty sources as duplicates of each other", () => {
    const issues = validateEntries([
      { source: "", target: "1" },
      { source: "", target: "2" },
    ]);
    expect(issues.map((i) => i.kind)).toEqual(["empty", "empty"]);
  });

  it("collects all issues across rows and fields", () => {
    const issues = validateEntries([{ source: "", target: "" }]);
    expect(issues).toMatchObject([
      { row: 0, field: "source", kind: "empty" },
      { row: 0, field: "target", kind: "empty" },
    ]);
  });
});
