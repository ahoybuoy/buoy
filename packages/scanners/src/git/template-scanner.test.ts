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
} from '../__tests__/fixtures/astro-components.js';
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
