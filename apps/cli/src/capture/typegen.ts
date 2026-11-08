// @ts-nocheck
// Placeholder props from TypeScript types: for each component, build a props
// object that satisfies its declared prop types (recursively), with values
// picked by field name so the render looks like real content, plus the list
// of variant-like props (unions of string literals) to render side by side.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export function placeholderProps(projectRoot, components) {
  const require = createRequire(join(projectRoot, 'package.json'));
  const ts = require('typescript');
  const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, 'tsconfig.json');
  const cfg = ts.readConfigFile(configPath, ts.sys.readFile);
  let parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, dirname(configPath));
  // Solution-style tsconfig (references only): use the app's referenced config.
  if (!parsed.fileNames.length && parsed.projectReferences?.length) {
    const ref = parsed.projectReferences.map((r) => ts.resolveProjectReferencePath(r)).find((p) => /app/.test(p)) ?? ts.resolveProjectReferencePath(parsed.projectReferences[0]);
    parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(ref, ts.sys.readFile).config, ts.sys, dirname(ref));
  }
  const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
  const checker = program.getTypeChecker();
  const now = new Date().toISOString();

  const WORDS = {
    title: ['Checkout flow', 'Pricing page', 'Settings'], name: ['Button', 'Card', 'Dialog'], label: ['Primary', 'Secondary', 'Danger'],
    description: ['Uses a hardcoded colour instead of --primary.', 'Padding is 13px; the scale has 12px and 16px.', 'Matches the design system.'],
    message: ['Hardcoded colour #4A90D9 (use --primary)', 'Spacing 13px is off the scale', 'Font size 15px is not a type token'],
    email: ['ada@example.com', 'grace@example.com', 'alan@example.com'], repo: ['acme/web', 'acme/app', 'acme/docs'],
  };
  function str(name, i = 0) {
    const n = (name || '').toLowerCase();
    if (/email/.test(n)) return WORDS.email[i % 3];
    if (/(url|href|link|src|image|avatar|logo)/.test(n)) return /(src|image|avatar|logo)/.test(n) ? '__img' : '#';
    if (/(date|time|at)$/.test(n)) return now;
    if (/(fullname|repo)/.test(n)) return WORDS.repo[i % 3];
    if (/(id|key|sha|hash)$/.test(n)) return `demo-${i + 1}`;
    if (/(title|heading)/.test(n)) return WORDS.title[i % 3];
    if (/(label|tag)/.test(n)) return WORDS.label[i % 3];
    if (/(name)/.test(n)) return WORDS.name[i % 3];
    if (/(message|error|reason)/.test(n)) return WORDS.message[i % 3];
    if (/(description|text|subtitle|summary|body|content|detail|note)/.test(n)) return WORDS.description[i % 3];
    if (/(colou?r|hex)/.test(n)) return ['#4A90D9', '#E5484D', '#30A46C'][i % 3];
    if (/(path|file)/.test(n)) return ['src/components/Button.tsx', 'src/pages/Settings.tsx', 'src/ui/Card.tsx'][i % 3];
    if (/(value)/.test(n)) return ['16px', '#4A90D9', '1.5rem'][i % 3];
    return 'Sample';
  }
  function num(name, i = 0) {
    const n = (name || '').toLowerCase();
    if (/(score|percent|health)/.test(n)) return [82, 64, 91][i % 3];
    if (/(line)/.test(n)) return 12 + i * 7;
    if (/(year)/.test(n)) return 2026;
    return [3, 12, 7][i % 3];
  }

  const isNamed = (t, names) => { const s = t.aliasSymbol || t.getSymbol(); return !!s && names.includes(s.getName()); };
  function gen(type, name, depth, i = 0) {
    if (depth > 5) return undefined;
    const F = ts.TypeFlags;
    if (type.flags & F.StringLiteral) return type.value;
    if (type.flags & F.NumberLiteral) return type.value;
    if (type.flags & F.BooleanLiteral) return type.intrinsicName === 'true';
    if (type.isUnion()) {
      const parts = type.types.filter((t) => !(t.flags & (F.Undefined | F.Null | F.Void)));
      if (parts.length && parts.every((t) => t.flags & F.BooleanLiteral)) return /^(open|visible|expanded)$/i.test(name || '') ;
      const lits = parts.filter((t) => t.flags & (F.StringLiteral | F.NumberLiteral));
      if (lits.length === parts.length && lits.length) return lits[i % lits.length].value;
      return parts.length ? gen(parts[0], name, depth, i) : undefined;
    }
    if (type.flags & (F.String | F.TemplateLiteral)) return str(name, i);
    if (type.flags & F.Number) return num(name, i);
    if (type.flags & F.Boolean) return /^(open|visible|expanded)$/i.test(name || '');
    if (type.flags & (F.Any | F.Unknown)) return str(name, i);
    if (isNamed(type, ['ReactNode', 'ReactElement', 'Element', 'ReactChild'])) return str(name === 'children' ? 'label' : name, i);
    if (isNamed(type, ['Date'])) return { __date: now };
    if (type.getCallSignatures().length) return { __fn: true };
    if (checker.isArrayType(type) || checker.isTupleType(type)) {
      const el = checker.getTypeArguments(type)[0];
      return el ? [0, 1, 2].map((k) => gen(el, singular(name), depth + 1, k)) : [];
    }
    if (isNamed(type, ['Record', 'Map', 'Set'])) return {};
    if (type.flags & F.Object) {
      const out = {};
      for (const p of checker.getPropertiesOfType(type).slice(0, 40)) {
        const decl = p.valueDeclaration || p.declarations?.[0];
        if (!decl) continue;
        const optional = !!(p.flags & ts.SymbolFlags.Optional);
        const pt = checker.getTypeOfSymbolAtLocation(p, decl);
        if (optional && (depth > 0 || pt.getCallSignatures().length)) continue;
        const v = gen(pt, p.getName(), depth + 1, i);
        if (v !== undefined) out[p.getName()] = v;
      }
      return out;
    }
    return undefined;
  }
  const singular = (n) => (n || '').replace(/ies$/, 'y').replace(/s$/, '');

  const result = {};
  for (const c of components) {
    try {
      const sf = program.getSourceFile(join(projectRoot, c.path));
      if (!sf) continue;
      const mod = checker.getSymbolAtLocation(sf);
      const exp = mod && checker.getExportsOfModule(mod).find((s) => s.getName() === c.name || (s.getName() === 'default' && checker.getAliasedSymbol?.(s)?.getName?.() === c.name));
      if (!exp) continue;
      const sym = exp.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exp) : exp;
      const decl = sym.valueDeclaration || sym.declarations?.[0];
      const t = checker.getTypeOfSymbolAtLocation(sym, decl);
      const sig = t.getCallSignatures()[0] || t.getConstructSignatures()[0];
      const param = sig?.parameters[0];
      if (!param) { result[c.id] = { props: {}, variants: [] }; continue; }
      const pt = checker.getTypeOfSymbolAtLocation(param, param.valueDeclaration || decl);
      const props = gen(pt, 'props', 0) || {};
      const variants = [];
      for (const p of checker.getPropertiesOfType(pt)) {
        const d = p.valueDeclaration || p.declarations?.[0]; if (!d) continue;
        const ptype = checker.getTypeOfSymbolAtLocation(p, d);
        if (!ptype.isUnion()) continue;
        const lits = ptype.types.filter((x) => x.flags & ts.TypeFlags.StringLiteral).map((x) => x.value);
        if (lits.length >= 2 && lits.length <= 8 && /variant|size|tone|intent|kind|color|colour|severity|status|appearance|type|shape|state|level/i.test(p.getName())) variants.push({ prop: p.getName(), values: lits });
      }
      result[c.id] = { props, variants };
    } catch (e) {
      result[c.id] = { error: String(e.message || e).slice(0, 120) };
    }
  }
  return result;
}
