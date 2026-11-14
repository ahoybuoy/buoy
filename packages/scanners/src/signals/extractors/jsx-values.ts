/**
 * Literal values in JSX/TSX, found through the TypeScript AST so a value is
 * seen wherever an expression can put it: `isError ? '#dc2626' : '#16a34a'`,
 * `active && '#fff'`, `c ?? '#fff'`, `` `1px solid ${x ? '#f00' : '#0f0'}` ``,
 * and class strings inside `cn(...)`, `clsx(...)` or a ternary.
 *
 * Each value carries the line of the literal itself, so a ternary split over
 * several lines reports each branch on its own line.
 */
import * as ts from 'typescript';

export interface LiteralValue {
  value: string;
  /** 1-based line of the literal. */
  line: number;
  /** A bare number (`padding: 8`): JSX style objects read it as pixels. */
  numeric: boolean;
}

export interface JsxDeclaredValue extends LiteralValue {
  /** Object key or JSX attribute name, as written (`backgroundColor`, `bg`). */
  property: string;
  /** A JSX attribute (`gap={4}`), not an object key. */
  attribute?: boolean;
  /** Inside an `sx={...}` prop, where MUI reads spacing and radius numbers as theme steps. */
  inSx?: boolean;
}

/** Is this node inside the value of a JSX `sx` attribute? */
function isInsideSx(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isJsxAttribute(n)) return n.name.getText(sourceFile) === 'sx';
  }
  return false;
}

export interface ArbitraryClassMatch {
  /** The whole class as written, variants included: `hover:bg-[#dc2626]`. */
  fullClass: string;
  line: number;
}

/** A colour written out in full inside a template chunk: `#fff`, `rgb(0 0 0)`. Partial ones (`#${hex}`, `rgba(0,0,0,${a})`) are skipped. */
const COMPLETE_COLOR = /#[0-9a-f]{3,8}(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab|color)\([^()$`]*\)/gi;
/** One whitespace-separated class with an arbitrary value somewhere in it. */
const CLASS_TOKEN = /\S+/g;
const HAS_ARBITRARY = /[\w-]-\[[^\]]+\]/;

function lineOf(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

export function parseTsx(content: string, path: string): ts.SourceFile {
  const kind = path.endsWith('.jsx') || path.endsWith('.js') ? ts.ScriptKind.JSX : ts.ScriptKind.TSX;
  return ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, kind);
}

/** Raw source of a template chunk, between its delimiters, and where it starts. */
function templateChunk(sourceFile: ts.SourceFile, node: ts.TemplateHead | ts.TemplateMiddle | ts.TemplateTail): { text: string; start: number } {
  const start = node.getStart(sourceFile) + 1; // after ` or }
  const end = node.getEnd() - (ts.isTemplateTail(node) ? 1 : 2); // before ` or ${
  return { text: sourceFile.text.slice(start, end), start };
}

/**
 * Every literal an expression can evaluate to. Conditions are not values
 * (`variant === 'danger' ? ...` yields only the branches), and calls are not
 * followed: `darken('#fff')` is the call's business, not a literal.
 */
export function literalValues(expr: ts.Expression, sourceFile: ts.SourceFile): LiteralValue[] {
  if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isNonNullExpression(expr)
    || ts.isTypeAssertionExpression(expr) || ts.isSatisfiesExpression(expr)) {
    return literalValues(expr.expression, sourceFile);
  }
  if (ts.isConditionalExpression(expr)) {
    return [...literalValues(expr.whenTrue, sourceFile), ...literalValues(expr.whenFalse, sourceFile)];
  }
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return literalValues(expr.right, sourceFile);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      return [...literalValues(expr.left, sourceFile), ...literalValues(expr.right, sourceFile)];
    }
    return [];
  }
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return [{ value: expr.text, line: lineOf(sourceFile, expr.getStart(sourceFile)), numeric: false }];
  }
  if (ts.isNumericLiteral(expr)) {
    return [{ value: expr.text, line: lineOf(sourceFile, expr.getStart(sourceFile)), numeric: true }];
  }
  if (ts.isTemplateExpression(expr)) {
    // `1px solid ${c}`: the substitutions are values, and so is a colour spelled out
    // in the static text. Other static text (`${n}px`) is not a value on its own.
    const values: LiteralValue[] = [];
    const chunks: Array<ts.TemplateHead | ts.TemplateMiddle | ts.TemplateTail> = [expr.head, ...expr.templateSpans.map((s) => s.literal)];
    chunks.forEach((chunk, index) => {
      const { text, start } = templateChunk(sourceFile, chunk);
      COMPLETE_COLOR.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = COMPLETE_COLOR.exec(text)) !== null) {
        // A colour that touches a substitution is only part of one: `#ff${x}`.
        if (index > 0 && m.index === 0) continue;
        if (index < chunks.length - 1 && m.index + m[0].length === text.length) continue;
        values.push({ value: m[0], line: lineOf(sourceFile, start + m.index), numeric: false });
      }
      if (index < expr.templateSpans.length) values.push(...literalValues(expr.templateSpans[index]!.expression, sourceFile));
    });
    return values.sort((a, b) => a.line - b.line);
  }
  return [];
}

function propertyName(name: ts.PropertyName, sourceFile: ts.SourceFile): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) return name.expression.text;
  return name.getText(sourceFile) || null;
}

/**
 * `{ key: value }` pairs and `attr={value}` / `attr="value"` attributes with
 * every literal value each one can take. Callers decide which keys matter.
 */
export function collectJsxDeclaredValues(content: string, path: string): JsxDeclaredValue[] {
  const sourceFile = parseTsx(content, path);
  const found: JsxDeclaredValue[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      const property = propertyName(node.name, sourceFile);
      if (property) {
        const inSx = isInsideSx(node, sourceFile);
        for (const v of literalValues(node.initializer, sourceFile)) found.push({ property, ...v, inSx });
      }
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const property = node.name.getText(sourceFile);
      const init = node.initializer;
      if (ts.isStringLiteral(init)) {
        found.push({ property, value: init.text, line: lineOf(sourceFile, init.getStart(sourceFile)), numeric: false, attribute: true });
      } else if (ts.isJsxExpression(init) && init.expression) {
        for (const v of literalValues(init.expression, sourceFile)) found.push({ property, ...v, attribute: true });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/**
 * Tailwind arbitrary classes (`bg-[#dc2626]`) in every string the code holds:
 * className attributes, ternaries, `cn()`/`clsx()`/`cva()` arguments, class
 * constants and template literals. Comments and page text are not strings,
 * so they are skipped.
 */
export function collectArbitraryClasses(content: string, path: string): ArbitraryClassMatch[] {
  const sourceFile = parseTsx(content, path);
  const found: ArbitraryClassMatch[] = [];
  const scan = (text: string, start: number): void => {
    CLASS_TOKEN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CLASS_TOKEN.exec(text)) !== null) {
      if (HAS_ARBITRARY.test(m[0])) found.push({ fullClass: m[0], line: lineOf(sourceFile, start + m.index) });
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      // Source text, not the cooked value, so offsets map to lines.
      const start = node.getStart(sourceFile) + 1;
      scan(sourceFile.text.slice(start, node.getEnd() - 1), start);
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const { text, start } = templateChunk(sourceFile, node);
      scan(text, start);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}
