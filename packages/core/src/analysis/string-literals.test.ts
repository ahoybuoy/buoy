import { describe, expect, it } from "vitest";
import { createPositionLookup, findStringLiterals } from "./string-literals.js";

const values = (content: string) => [...findStringLiterals(content)].map((l) => l.value);

describe("findStringLiterals", () => {
  it("finds single, double and template literals", () => {
    expect(values(`a('bg-red-500'); b("p-4 m-2"); c(\`flex gap-2\`)`)).toEqual([
      "bg-red-500",
      "p-4 m-2",
      "flex gap-2",
    ]);
  });

  it("keeps escaped quotes inside the literal", () => {
    expect(values(`x = "say \\"hi\\" there"`)).toEqual([`say \\"hi\\" there`]);
  });

  it("does not let an apostrophe in JSX text swallow the rest of the file", () => {
    const content = `<p>Don't worry</p>\n<div className="bg-surface p-4" />`;
    expect(values(content)).toContain("bg-surface p-4");
  });

  it("lets template literals span lines", () => {
    expect(values("cn(`flex\n  gap-2`)")).toEqual(["flex\n  gap-2"]);
  });

  it("stays linear on input that made the old pattern backtrack", () => {
    // Many backslashes after an unmatched quote: exponential for the old regex.
    const content = `"${"\\\\a".repeat(5000)}` + "\n".repeat(10) + "'x'".repeat(20000);
    const start = Date.now();
    const found = [...findStringLiterals(content)];
    expect(Date.now() - start).toBeLessThan(1000);
    expect(found.length).toBe(20000);
  });
});

describe("createPositionLookup", () => {
  it("returns 1-based line and column", () => {
    const at = createPositionLookup("ab\ncd\n\nef");
    expect(at(0)).toEqual({ lineNumber: 1, columnNumber: 1 });
    expect(at(1)).toEqual({ lineNumber: 1, columnNumber: 2 });
    expect(at(3)).toEqual({ lineNumber: 2, columnNumber: 1 });
    expect(at(6)).toEqual({ lineNumber: 3, columnNumber: 1 });
    expect(at(8)).toEqual({ lineNumber: 4, columnNumber: 2 });
  });
});
