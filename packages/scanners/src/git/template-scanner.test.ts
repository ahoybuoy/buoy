// packages/scanners/src/git/template-scanner.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  SIMPLE_BUTTON_ASTRO,
  CARD_WITH_PROPS_ASTRO,
  COMPONENT_WITH_TYPE_PROPS_ASTRO,
  DEPRECATED_COMPONENT_ASTRO,
  COMPONENT_WITH_DEPENDENCIES_ASTRO,
  LAYOUT_ASTRO,
  COMPONENT_WITH_SLOTS_ASTRO,
  PAGE_COMPONENT_ASTRO,
  RECURSIVE_COMPONENT_ASTRO,
  COMPONENT_WITH_DIRECTIVES_ASTRO,
  COMPONENT_WITH_TYPE_IMPORTS_ASTRO,
  COMPONENT_WITH_COMPLEX_PROPS_ASTRO,
  COMPONENT_WITH_SLOT_FALLBACK_ASTRO,
  COMPONENT_WITH_MULTI_FRAMEWORK_ASTRO,
  COMPONENT_WITH_EXPORT_TYPE_PROPS_ASTRO,
  COMPONENT_WITH_INTERSECTION_PROPS_ASTRO,
  COMPONENT_WITH_SIMPLE_INTERSECTION_ASTRO,
  COMPONENT_WITH_UNION_TYPE_ASTRO,
  COMPONENT_WITH_EXTENDS_PROPS_ASTRO,
  COMPONENT_WITH_EXTENDS_EMPTY_PROPS_ASTRO,
  COMPONENT_WITH_EXTENDS_AND_EXTRA_PROPS_ASTRO,
} from '../__tests__/fixtures/astro-components.js';
import {
  SIMPLE_COUNTER_SOLID,
  COMPONENT_WITH_EFFECTS_SOLID,
  COMPONENT_WITH_STORE_SOLID,
  COMPONENT_WITH_CONTROL_FLOW_SOLID,
  COMPONENT_WITH_DYNAMIC_SOLID,
  COMPONENT_WITH_ADVANCED_SOLID,
  COMPONENT_WITH_JSX_PRAGMA_SOLID,
  DEPRECATED_COMPONENT_SOLID,
  REACT_COMPONENT_NOT_SOLID,
  PLAIN_TYPESCRIPT_NOT_SOLID,
} from '../__tests__/fixtures/solid-components.js';
import {
  SIMPLE_COUNTER_QWIK,
  COMPONENT_WITH_STORE_QWIK,
  COMPONENT_WITH_TASKS_QWIK,
  COMPONENT_WITH_COMPUTED_QWIK,
  COMPONENT_WITH_ROUTE_LOADERS_QWIK,
  COMPONENT_WITH_SLOTS_QWIK,
  DEPRECATED_COMPONENT_QWIK,
  COMPONENT_WITH_INLINE_HANDLERS_QWIK,
} from '../__tests__/fixtures/qwik-components.js';
import { TemplateScanner } from './template-scanner.js';

describe('TemplateScanner - Astro', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('component detection', () => {
    it('detects Astro components in src/components directory', async () => {
      vol.fromJSON({
        '/project/src/components/Button.astro': SIMPLE_BUTTON_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Button');
      expect(result.items[0]!.source.type).toBe('astro');
    });

    it('detects Astro components in src/layouts directory', async () => {
      vol.fromJSON({
        '/project/src/layouts/Layout.astro': LAYOUT_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Layout');
    });

    it('detects Astro pages as components', async () => {
      vol.fromJSON({
        '/project/src/pages/index.astro': PAGE_COMPONENT_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Index');
    });

    it('detects multiple Astro components', async () => {
      vol.fromJSON({
        '/project/src/components/Button.astro': SIMPLE_BUTTON_ASTRO,
        '/project/src/components/Card.astro': CARD_WITH_PROPS_ASTRO,
        '/project/src/layouts/Layout.astro': LAYOUT_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(3);
      const names = result.items.map(c => c.name);
      expect(names).toContain('Button');
      expect(names).toContain('Card');
      expect(names).toContain('Layout');
    });

    it('detects recursive components using Astro.self', async () => {
      vol.fromJSON({
        '/project/src/components/Comment.astro': RECURSIVE_COMPONENT_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Comment');
      // Recursive component should detect Show and Toggle as dependencies
      expect(result.items[0]!.dependencies).toContain('Show');
      expect(result.items[0]!.dependencies).toContain('Toggle');
    });

    it('detects components with set:html and set:text directives', async () => {
      vol.fromJSON({
        '/project/src/components/Article.astro': COMPONENT_WITH_DIRECTIVES_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.props).toHaveLength(3);
    });
  });

  describe('props extraction', () => {
    it('extracts props from interface Props', async () => {
      vol.fromJSON({
        '/project/src/components/Card.astro': CARD_WITH_PROPS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(2);

      const titleProp = result.items[0]!.props.find(p => p.name === 'title');
      expect(titleProp).toBeDefined();
      expect(titleProp!.required).toBe(true);
      expect(titleProp!.type).toBe('string');

      const descriptionProp = result.items[0]!.props.find(p => p.name === 'description');
      expect(descriptionProp).toBeDefined();
      expect(descriptionProp!.required).toBe(false);
    });

    it('extracts props from type Props', async () => {
      vol.fromJSON({
        '/project/src/components/Button.astro': COMPONENT_WITH_TYPE_PROPS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(1);

      const sizeProp = result.items[0]!.props.find(p => p.name === 'size');
      expect(sizeProp).toBeDefined();
      expect(sizeProp!.required).toBe(true);

      const disabledProp = result.items[0]!.props.find(p => p.name === 'disabled');
      expect(disabledProp).toBeDefined();
      expect(disabledProp!.required).toBe(false);
    });

    it('extracts complex multiline props', async () => {
      vol.fromJSON({
        '/project/src/components/Complex.astro': COMPONENT_WITH_COMPLEX_PROPS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      // Should extract exactly 8 top-level props, NOT nested object members
      expect(result.items[0]!.props).toHaveLength(8);

      const propNames = result.items[0]!.props.map(p => p.name);
      expect(propNames).toContain('title');
      expect(propNames).toContain('subtitle');
      expect(propNames).toContain('variant');
      expect(propNames).toContain('size');
      expect(propNames).toContain('disabled');
      expect(propNames).toContain('onClick');
      expect(propNames).toContain('items');
      expect(propNames).toContain('config');

      // Should NOT extract nested object members as top-level props
      expect(propNames).not.toContain('id');
      expect(propNames).not.toContain('label');
      expect(propNames).not.toContain('icon');
      expect(propNames).not.toContain('showHeader');
      expect(propNames).not.toContain('showFooter');
      expect(propNames).not.toContain('theme');

      const titleProp = result.items[0]!.props.find(p => p.name === 'title');
      expect(titleProp).toBeDefined();
      expect(titleProp!.required).toBe(true);

      const variantProp = result.items[0]!.props.find(p => p.name === 'variant');
      expect(variantProp).toBeDefined();
      expect(variantProp!.required).toBe(true);

      const disabledProp = result.items[0]!.props.find(p => p.name === 'disabled');
      expect(disabledProp).toBeDefined();
      expect(disabledProp!.required).toBe(false);

      // Should capture nested type properly
      const itemsProp = result.items[0]!.props.find(p => p.name === 'items');
      expect(itemsProp).toBeDefined();
      expect(itemsProp!.required).toBe(true);
      expect(itemsProp!.type).toContain('Array');
      expect(itemsProp!.type).toContain('id');
      expect(itemsProp!.type).toContain('label');

      // config prop should be extracted (comes after nested Array<{...}>)
      const configProp = result.items[0]!.props.find(p => p.name === 'config');
      expect(configProp).toBeDefined();
      expect(configProp!.required).toBe(true);
      expect(configProp!.type).toContain('showHeader');
    });

    it('extracts props with external type references', async () => {
      vol.fromJSON({
        '/project/src/components/TypeImports.astro': COMPONENT_WITH_TYPE_IMPORTS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.props.length).toBeGreaterThanOrEqual(2);

      const metaProp = result.items[0]!.props.find(p => p.name === 'meta');
      expect(metaProp).toBeDefined();
      expect(metaProp!.type).toBe('PageMeta');

      const authorProp = result.items[0]!.props.find(p => p.name === 'author');
      expect(authorProp).toBeDefined();
      expect(authorProp!.type).toBe('Author');
    });

    it('extracts props from export type Props', async () => {
      vol.fromJSON({
        '/project/src/components/Dialog.astro': COMPONENT_WITH_EXPORT_TYPE_PROPS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.props).toHaveLength(3);

      const titleProp = result.items[0]!.props.find(p => p.name === 'title');
      expect(titleProp).toBeDefined();
      expect(titleProp!.required).toBe(true);
      expect(titleProp!.type).toBe('string');

      const isOpenProp = result.items[0]!.props.find(p => p.name === 'isOpen');
      expect(isOpenProp).toBeDefined();
      expect(isOpenProp!.required).toBe(false);

      const onCloseProp = result.items[0]!.props.find(p => p.name === 'onClose');
      expect(onCloseProp).toBeDefined();
      expect(onCloseProp!.required).toBe(true);
    });

    it('extracts inline props from intersection type with grouped unions', async () => {
      vol.fromJSON({
        '/project/src/components/Picture.astro': COMPONENT_WITH_INTERSECTION_PROPS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      // Should extract the 3 inline props from the intersection type
      expect(result.items[0]!.props).toHaveLength(3);

      const formatsProp = result.items[0]!.props.find(p => p.name === 'formats');
      expect(formatsProp).toBeDefined();
      expect(formatsProp!.required).toBe(false);

      const fallbackProp = result.items[0]!.props.find(p => p.name === 'fallbackFormat');
      expect(fallbackProp).toBeDefined();
      expect(fallbackProp!.required).toBe(false);

      const pictureAttrsProp = result.items[0]!.props.find(p => p.name === 'pictureAttributes');
      expect(pictureAttrsProp).toBeDefined();
      expect(pictureAttrsProp!.required).toBe(false);
    });

    it('extracts inline props from simple intersection type', async () => {
      vol.fromJSON({
        '/project/src/components/Extended.astro': COMPONENT_WITH_SIMPLE_INTERSECTION_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      // Should extract the 2 inline props from the simple intersection
      expect(result.items[0]!.props).toHaveLength(2);

      const extraFieldProp = result.items[0]!.props.find(p => p.name === 'extraField');
      expect(extraFieldProp).toBeDefined();
      expect(extraFieldProp!.required).toBe(true);
      expect(extraFieldProp!.type).toBe('string');

      const optionalProp = result.items[0]!.props.find(p => p.name === 'optional');
      expect(optionalProp).toBeDefined();
      expect(optionalProp!.required).toBe(false);
    });

    it('returns empty props for pure union type (external type references)', async () => {
      vol.fromJSON({
        '/project/src/components/Image.astro': COMPONENT_WITH_UNION_TYPE_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      // Pure union type with no inline props - cannot extract prop definitions
      expect(result.items[0]!.props).toHaveLength(0);
    });

    it('extracts props from interface Props extends pattern', async () => {
      vol.fromJSON({
        '/project/src/components/Code.astro': COMPONENT_WITH_EXTENDS_PROPS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      // Should extract the 4 inline props from the interface body
      expect(result.items[0]!.props).toHaveLength(4);

      const codeProp = result.items[0]!.props.find(p => p.name === 'code');
      expect(codeProp).toBeDefined();
      expect(codeProp!.required).toBe(true);
      expect(codeProp!.type).toBe('string');

      const langProp = result.items[0]!.props.find(p => p.name === 'lang');
      expect(langProp).toBeDefined();
      expect(langProp!.required).toBe(false);

      const themeProp = result.items[0]!.props.find(p => p.name === 'theme');
      expect(themeProp).toBeDefined();
      expect(themeProp!.required).toBe(false);

      const wrapProp = result.items[0]!.props.find(p => p.name === 'wrap');
      expect(wrapProp).toBeDefined();
      expect(wrapProp!.required).toBe(false);
    });

    it('returns empty props for interface Props extends with empty body', async () => {
      vol.fromJSON({
        '/project/src/components/HeaderLink.astro': COMPONENT_WITH_EXTENDS_EMPTY_PROPS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      // Empty interface body - no inline props to extract
      expect(result.items[0]!.props).toHaveLength(0);
    });

    it('extracts props from interface Props extends with additional inline props', async () => {
      vol.fromJSON({
        '/project/src/components/ToggleDiv.astro': COMPONENT_WITH_EXTENDS_AND_EXTRA_PROPS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      // Should extract the 3 inline props from the interface body
      expect(result.items[0]!.props).toHaveLength(3);

      const isActiveProp = result.items[0]!.props.find(p => p.name === 'isActive');
      expect(isActiveProp).toBeDefined();
      expect(isActiveProp!.required).toBe(true);
      expect(isActiveProp!.type).toBe('boolean');

      const countProp = result.items[0]!.props.find(p => p.name === 'count');
      expect(countProp).toBeDefined();
      expect(countProp!.required).toBe(false);
      expect(countProp!.type).toBe('number');

      const onToggleProp = result.items[0]!.props.find(p => p.name === 'onToggle');
      expect(onToggleProp).toBeDefined();
      expect(onToggleProp!.required).toBe(true);
    });
  });

  describe('deprecation detection', () => {
    it('detects @deprecated JSDoc tag in frontmatter', async () => {
      vol.fromJSON({
        '/project/src/components/OldHeader.astro': DEPRECATED_COMPONENT_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(true);
    });

    it('non-deprecated components are not marked as deprecated', async () => {
      vol.fromJSON({
        '/project/src/components/Button.astro': SIMPLE_BUTTON_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(false);
    });
  });

  describe('dependency detection', () => {
    it('detects component dependencies from imports', async () => {
      vol.fromJSON({
        '/project/src/components/Page.astro': COMPONENT_WITH_DEPENDENCIES_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.dependencies).toContain('Header');
      expect(result.items[0]!.dependencies).toContain('Footer');
    });

    it('detects Astro.slots usage', async () => {
      vol.fromJSON({
        '/project/src/components/Container.astro': COMPONENT_WITH_SLOTS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      // Component should be detected
      expect(result.items).toHaveLength(1);
    });

    it('detects multi-framework dependencies', async () => {
      vol.fromJSON({
        '/project/src/components/MultiFramework.astro': COMPONENT_WITH_MULTI_FRAMEWORK_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      // Should detect React, Vue, Svelte, and Solid component dependencies
      expect(result.items[0]!.dependencies).toContain('ReactCounter');
      expect(result.items[0]!.dependencies).toContain('VueCard');
      expect(result.items[0]!.dependencies).toContain('SvelteButton');
      expect(result.items[0]!.dependencies).toContain('SolidToggle');
    });
  });

  describe('scan statistics', () => {
    it('returns correct scan statistics', async () => {
      vol.fromJSON({
        '/project/src/components/Button.astro': SIMPLE_BUTTON_ASTRO,
        '/project/src/components/Card.astro': CARD_WITH_PROPS_ASTRO,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.astro'],
        templateType: 'astro',
      });

      const result = await scanner.scan();

      expect(result.stats.filesScanned).toBe(2);
      expect(result.stats.itemsFound).toBe(2);
      expect(result.stats.duration).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('TemplateScanner - Solid', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('component detection', () => {
    it('detects Solid components with createSignal', async () => {
      vol.fromJSON({
        '/project/src/components/Counter.tsx': SIMPLE_COUNTER_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Counter');
      expect(result.items[0]!.source.type).toBe('solid');
    });

    it('detects Solid components with createEffect and createMemo', async () => {
      vol.fromJSON({
        '/project/src/components/Calculator.tsx': COMPONENT_WITH_EFFECTS_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Calculator');
    });

    it('detects Solid components with createStore', async () => {
      vol.fromJSON({
        '/project/src/components/TodoList.tsx': COMPONENT_WITH_STORE_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('TodoList');
    });

    it('detects Solid components with control flow components', async () => {
      vol.fromJSON({
        '/project/src/components/DataDisplay.tsx': COMPONENT_WITH_CONTROL_FLOW_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('DataDisplay');
    });

    it('detects Solid components with Dynamic', async () => {
      vol.fromJSON({
        '/project/src/components/DynamicButton.tsx': COMPONENT_WITH_DYNAMIC_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('DynamicButton');
    });

    it('detects Solid components with advanced patterns (ErrorBoundary, Suspense, Portal)', async () => {
      vol.fromJSON({
        '/project/src/components/DataLoader.tsx': COMPONENT_WITH_ADVANCED_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('DataLoader');
    });

    it('detects Solid components with JSX pragma', async () => {
      vol.fromJSON({
        '/project/src/components/Card.tsx': COMPONENT_WITH_JSX_PRAGMA_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Card');
    });
  });

  describe('deprecation detection', () => {
    it('detects @deprecated JSDoc in Solid components', async () => {
      vol.fromJSON({
        '/project/src/components/OldCounter.tsx': DEPRECATED_COMPONENT_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(true);
    });
  });

  describe('framework filtering', () => {
    it('does NOT detect React components when scanning for Solid', async () => {
      vol.fromJSON({
        '/project/src/components/ReactCounter.tsx': REACT_COMPONENT_NOT_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      // React component should NOT be detected as a Solid component
      expect(result.items).toHaveLength(0);
    });

    it('does NOT detect plain TypeScript files when scanning for Solid', async () => {
      vol.fromJSON({
        '/project/src/utils/user.ts': PLAIN_TYPESCRIPT_NOT_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.ts'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      // Plain TypeScript should NOT be detected as a Solid component
      expect(result.items).toHaveLength(0);
    });

    it('only detects Solid components when multiple frameworks are present', async () => {
      vol.fromJSON({
        '/project/src/components/SolidCounter.tsx': SIMPLE_COUNTER_SOLID,
        '/project/src/components/ReactCounter.tsx': REACT_COMPONENT_NOT_SOLID,
        '/project/src/utils/user.ts': PLAIN_TYPESCRIPT_NOT_SOLID,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx', 'src/**/*.ts'],
        templateType: 'solid',
      });

      const result = await scanner.scan();

      // Only the Solid component should be detected
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('SolidCounter');
    });
  });
});

describe('TemplateScanner - Qwik', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('component detection', () => {
    it('detects Qwik components with component$ and useSignal', async () => {
      vol.fromJSON({
        '/project/src/components/Counter.tsx': SIMPLE_COUNTER_QWIK,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'qwik',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Counter');
      expect(result.items[0]!.source.type).toBe('qwik');
    });

    it('detects Qwik components with useStore', async () => {
      vol.fromJSON({
        '/project/src/components/TodoList.tsx': COMPONENT_WITH_STORE_QWIK,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'qwik',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('TodoList');
    });

    it('detects Qwik components with useTask$ and useVisibleTask$', async () => {
      vol.fromJSON({
        '/project/src/components/UserProfile.tsx': COMPONENT_WITH_TASKS_QWIK,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'qwik',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('UserProfile');
    });

    it('detects Qwik components with useComputed$ and useResource$', async () => {
      vol.fromJSON({
        '/project/src/components/DataDisplay.tsx': COMPONENT_WITH_COMPUTED_QWIK,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'qwik',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('DataDisplay');
    });

    it('detects Qwik City components with routeLoader$ and routeAction$', async () => {
      vol.fromJSON({
        '/project/src/routes/product/[id]/index.tsx': COMPONENT_WITH_ROUTE_LOADERS_QWIK,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'qwik',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Index');
    });

    it('detects Qwik components with Slot handling', async () => {
      vol.fromJSON({
        '/project/src/components/Card.tsx': COMPONENT_WITH_SLOTS_QWIK,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'qwik',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Card');
    });

    it('detects Qwik components with inline $ handlers', async () => {
      vol.fromJSON({
        '/project/src/components/Form.tsx': COMPONENT_WITH_INLINE_HANDLERS_QWIK,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'qwik',
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe('Form');
    });
  });

  describe('deprecation detection', () => {
    it('detects @deprecated JSDoc in Qwik components', async () => {
      vol.fromJSON({
        '/project/src/components/OldButton.tsx': DEPRECATED_COMPONENT_QWIK,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['src/**/*.tsx'],
        templateType: 'qwik',
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.deprecated).toBe(true);
    });
  });
});

describe('TemplateScanner - Inline Style Detection', () => {
  beforeEach(() => {
    vol.reset();
  });

  describe('Razor templates (.cshtml)', () => {
    it('detects hardcoded colors in inline styles', async () => {
      vol.fromJSON({
        '/project/Views/Shared/_Header.cshtml': `
<header style="background-color: #3b82f6; color: #ffffff;">
  <h1>@Model.Title</h1>
</header>`,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['**/*.cshtml'],
        templateType: 'razor',
      });

      const result = await scanner.scanWithSignals();
      const signals = result.signals;

      // Should detect hardcoded color values
      const colorSignals = signals.filter(s => s.type === 'color-value');
      expect(colorSignals.length).toBeGreaterThanOrEqual(2);
    });

    it('skips dynamic Razor expressions in styles', async () => {
      vol.fromJSON({
        '/project/Views/Shared/_Theme.cshtml': `
<div style="background-color: @Model.ThemeColor; color: @ViewBag.TextColor;">
  Content
</div>`,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['**/*.cshtml'],
        templateType: 'razor',
      });

      const result = await scanner.scanWithSignals();
      const signals = result.signals;

      // Should NOT detect dynamic expressions as drift
      const colorSignals = signals.filter(s => s.type === 'color-value');
      expect(colorSignals.length).toBe(0);
    });

    it('detects hardcoded spacing values', async () => {
      vol.fromJSON({
        '/project/Views/Components/_Card.cshtml': `
<div style="padding: 16px; margin: 24px;">
  @RenderBody()
</div>`,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['**/*.cshtml'],
        templateType: 'razor',
      });

      const result = await scanner.scanWithSignals();
      const signals = result.signals;

      // Should detect hardcoded spacing values
      const spacingSignals = signals.filter(s => s.type === 'spacing-value');
      expect(spacingSignals.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Blade templates (.blade.php)', () => {
    it('detects hardcoded values and skips Blade expressions', async () => {
      vol.fromJSON({
        '/project/resources/views/components/button.blade.php': `
<button style="background: #ff0000; padding: {{ $padding }}px;">
  {{ $slot }}
</button>`,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['**/*.blade.php'],
        templateType: 'blade',
      });

      const result = await scanner.scanWithSignals();
      const signals = result.signals;

      // Should detect #ff0000 but not {{ $padding }}
      const colorSignals = signals.filter(s => s.type === 'color-value');
      expect(colorSignals.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ERB templates (.html.erb)', () => {
    it('detects hardcoded values and skips ERB expressions', async () => {
      vol.fromJSON({
        '/project/app/views/shared/_alert.html.erb': `
<div style="border-color: #dc2626; background: <%= @alert_color %>;">
  <%= yield %>
</div>`,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['**/*.html.erb'],
        templateType: 'erb',
      });

      const result = await scanner.scanWithSignals();
      const signals = result.signals;

      // Should detect #dc2626 but not <%= @alert_color %>
      const colorSignals = signals.filter(s => s.type === 'color-value');
      expect(colorSignals.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Twig templates (.html.twig)', () => {
    it('detects hardcoded values and skips Twig expressions', async () => {
      vol.fromJSON({
        '/project/templates/components/card.html.twig': `
<div style="color: #1f2937; background: {{ theme.background }};">
  {% block content %}{% endblock %}
</div>`,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['**/*.html.twig'],
        templateType: 'twig',
      });

      const result = await scanner.scanWithSignals();
      const signals = result.signals;

      // Should detect #1f2937 but not {{ theme.background }}
      const colorSignals = signals.filter(s => s.type === 'color-value');
      expect(colorSignals.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('skips CSS variables and tokens', () => {
    it('does not flag CSS variables as drift', async () => {
      vol.fromJSON({
        '/project/Views/Shared/_Layout.cshtml': `
<div style="color: var(--text-primary); background: var(--bg-surface);">
  @RenderBody()
</div>`,
      });

      const scanner = new TemplateScanner({
        projectRoot: '/project',
        include: ['**/*.cshtml'],
        templateType: 'razor',
      });

      const result = await scanner.scanWithSignals();
      const signals = result.signals;

      // Should NOT flag CSS variables
      const colorSignals = signals.filter(s => s.type === 'color-value');
      expect(colorSignals.length).toBe(0);
    });
  });
});
