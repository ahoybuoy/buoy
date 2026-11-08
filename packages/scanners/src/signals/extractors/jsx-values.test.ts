import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import { collectArbitraryClasses, collectJsxDeclaredValues, literalValues, parseTsx } from './jsx-values.js';

function valuesOf(expression: string) {
  const sf = parseTsx(`const x = ${expression};`, 'a.tsx');
  const decl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0]!;
  return literalValues(decl.initializer!, sf).map((v) => v.value);
}

describe('literalValues', () => {
  it('follows ternary branches but not the condition', () => {
    expect(valuesOf("variant === 'danger' ? '#dc2626' : '#16a34a'")).toEqual(['#dc2626', '#16a34a']);
  });

  it('takes the value side of &&, both sides of || and ??', () => {
    expect(valuesOf("on && '#fff'")).toEqual(['#fff']);
    expect(valuesOf("'#000' || c")).toEqual(['#000']);
    expect(valuesOf("c ?? ('#111' as const)")).toEqual(['#111']);
  });

  it('reads substitutions and complete colours out of template literals', () => {
    expect(valuesOf("`1px solid ${on ? '#f00' : '#0f0'}`")).toEqual(['#f00', '#0f0']);
    expect(valuesOf('`0 0 0 1px #e5e7eb, ${ring}`')).toEqual(['#e5e7eb']);
    expect(valuesOf('`#${hex}`')).toEqual([]);
    expect(valuesOf('`#ff${rest}`')).toEqual([]);
    expect(valuesOf('`rgba(0,0,0,${a})`')).toEqual([]);
    expect(valuesOf('`${n}px`')).toEqual([]);
  });

  it('does not follow calls or references', () => {
    expect(valuesOf("darken('#fff', 0.1)")).toEqual([]);
    expect(valuesOf('theme.colors.red')).toEqual([]);
  });
});

describe('collectJsxDeclaredValues', () => {
  it('finds object keys and JSX attributes with the literal line', () => {
    const tsx = "<Box\n  bg={on\n    ? '#fff'\n    : '#000'}\n  style={{ padding: 8 }}\n/>";
    expect(collectJsxDeclaredValues(tsx, 'a.tsx').map((v) => [v.property, v.value, v.line, v.numeric])).toEqual([
      ['bg', '#fff', 3, false],
      ['bg', '#000', 4, false],
      ['padding', '8', 5, true],
    ]);
  });
});

describe('collectArbitraryClasses', () => {
  it('finds arbitrary classes in strings only, with variants and lines', () => {
    const tsx = "// bg-[#123]\nconst c = cn(\n  'p-2 hover:bg-[#dc2626]',\n  on && `text-[14px]`,\n);\n<p>bg-[#fff]</p>";
    expect(collectArbitraryClasses(tsx, 'a.tsx')).toEqual([
      { fullClass: 'hover:bg-[#dc2626]', line: 3 },
      { fullClass: 'text-[14px]', line: 4 },
    ]);
  });
});
