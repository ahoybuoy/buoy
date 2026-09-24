/**
 * String literal scanning for class-name extraction.
 *
 * The old pattern, /(['"`])((?:\\.|(?!\1)[\s\S])*)\1/, let a backslash match
 * either alternative, so a failed match backtracked exponentially, and an
 * unmatched quote (an apostrophe in JSX text) scanned to the end of the file.
 * On trigger.dev `buoy system map` never finished. Here the alternatives are
 * disjoint, and '…' / "…" stop at a newline as JavaScript strings do.
 */
const STRING_LITERAL = /(['"])((?:\\.|(?!\1)[^\\\n])*)\1|`((?:\\[\s\S]|[^\\`])*)`/g;

export interface StringLiteral {
  /** Offset of the opening quote. */
  index: number;
  /** The contents between the quotes, escapes left as written. */
  value: string;
}

export function* findStringLiterals(content: string): Generator<StringLiteral> {
  const pattern = new RegExp(STRING_LITERAL.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    yield { index: match.index, value: match[2] ?? match[3] ?? "" };
  }
}

/**
 * 1-based line and column for offsets in `content`. Line starts are computed
 * once, so each lookup is a binary search instead of a rescan from offset 0.
 */
export function createPositionLookup(content: string): (index: number) => { lineNumber: number; columnNumber: number } {
  const lineStarts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }
  return (index: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= index) lo = mid;
      else hi = mid - 1;
    }
    return { lineNumber: lo + 1, columnNumber: index - lineStarts[lo]! + 1 };
  };
}
