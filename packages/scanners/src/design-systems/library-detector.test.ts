/**
 * Tests for Design System Library Detector
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';

// Unmock fs modules and glob to use real filesystem
vi.unmock('fs/promises');
vi.unmock('fs');
vi.unmock('glob');

// Must import after unmock
const { mkdtemp, writeFile, mkdir, rm } = await import('fs/promises');
const { tmpdir } = await import('os');

import { detectDesignSystemLibraries } from './library-detector.js';

describe('detectDesignSystemLibraries', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'buoy-lib-detect-'));
    await mkdir(join(testDir, 'src'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('returns empty result for project without package.json', async () => {
    const result = await detectDesignSystemLibraries(testDir);
    expect(result.libraries).toEqual([]);
    expect(result.hasMultipleLibraries).toBe(false);
  });

  it('returns empty result for project without UI libraries', async () => {
    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({
        dependencies: {
          react: '^18.0.0',
          lodash: '^4.17.0',
        },
      }),
    );

    const result = await detectDesignSystemLibraries(testDir);
    expect(result.libraries).toEqual([]);
  });

  describe('Chakra UI detection', () => {
    it('detects Chakra UI from package.json', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            '@chakra-ui/react': '^2.8.0',
          },
        }),
      );

      const result = await detectDesignSystemLibraries(testDir);
      expect(result.libraries).toHaveLength(1);
      expect(result.libraries[0]!.name).toBe('chakra-ui');
      expect(result.libraries[0]!.version).toBe('^2.8.0');
    });

    it('extracts Chakra UI components from imports', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({ dependencies: { '@chakra-ui/react': '^2.8.0' } }),
      );
      await writeFile(
        join(testDir, 'src/App.tsx'),
        `import { Button, Box, Flex, Modal } from '@chakra-ui/react';`,
      );

      const result = await detectDesignSystemLibraries(testDir);
      expect(result.libraries[0]!.components).toContain('Button');
      expect(result.libraries[0]!.components).toContain('Box');
      expect(result.libraries[0]!.components).toContain('Flex');
      expect(result.libraries[0]!.components).toContain('Modal');
      expect(result.libraries[0]!.componentCount).toBe(4);
    });
  });

  describe('Radix UI detection', () => {
    it('detects Radix UI from scoped packages', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            '@radix-ui/react-dialog': '^1.0.0',
            '@radix-ui/react-popover': '^1.0.0',
          },
        }),
      );

      const result = await detectDesignSystemLibraries(testDir);
      expect(result.libraries).toHaveLength(1);
      expect(result.libraries[0]!.name).toBe('radix-ui');
    });

    it('extracts Radix component names from package imports', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            '@radix-ui/react-dialog': '^1.0.0',
          },
        }),
      );
      await writeFile(
        join(testDir, 'src/Dialog.tsx'),
        `import * as Dialog from '@radix-ui/react-dialog';
         import * as Popover from '@radix-ui/react-popover';`,
      );

      const result = await detectDesignSystemLibraries(testDir);
      expect(result.libraries[0]!.components).toContain('Dialog');
      expect(result.libraries[0]!.components).toContain('Popover');
    });
  });

  describe('MUI detection', () => {
    it('detects MUI from @mui/material', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({
          dependencies: { '@mui/material': '^5.0.0' },
        }),
      );

      const result = await detectDesignSystemLibraries(testDir);
      expect(result.libraries).toHaveLength(1);
      expect(result.libraries[0]!.name).toBe('mui');
    });

    it('extracts MUI components from imports', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({ dependencies: { '@mui/material': '^5.0.0' } }),
      );
      await writeFile(
        join(testDir, 'src/App.tsx'),
        `import { Button, TextField, Card } from '@mui/material';`,
      );

      const result = await detectDesignSystemLibraries(testDir);
      expect(result.libraries[0]!.components).toContain('Button');
      expect(result.libraries[0]!.components).toContain('TextField');
      expect(result.libraries[0]!.components).toContain('Card');
    });
  });

  describe('Ant Design detection', () => {
    it('detects Ant Design from antd package', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({
          dependencies: { antd: '^5.0.0' },
        }),
      );

      const result = await detectDesignSystemLibraries(testDir);
      expect(result.libraries).toHaveLength(1);
      expect(result.libraries[0]!.name).toBe('ant-design');
    });

    it('extracts Ant Design components', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({ dependencies: { antd: '^5.0.0' } }),
      );
      await writeFile(
        join(testDir, 'src/App.tsx'),
        `import { Button, Table, Form, Input } from 'antd';`,
      );

      const result = await detectDesignSystemLibraries(testDir);
      expect(result.libraries[0]!.components).toContain('Button');
      expect(result.libraries[0]!.components).toContain('Table');
      expect(result.libraries[0]!.componentCount).toBe(4);
    });
  });

  describe('Mantine detection', () => {
    it('detects Mantine from @mantine/core', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({
          dependencies: { '@mantine/core': '^7.0.0' },
        }),
      );

      const result = await detectDesignSystemLibraries(testDir);
      expect(result.libraries).toHaveLength(1);
      expect(result.libraries[0]!.name).toBe('mantine');
    });
  });

  describe('shadcn/ui detection', () => {
    it('detects shadcn/ui from import pattern without package.json entry', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({ dependencies: { react: '^18.0.0' } }),
      );
      await writeFile(
        join(testDir, 'src/App.tsx'),
        `import { Button } from '@/components/ui/button';
         import { Card } from '@/components/ui/card';`,
      );

      const result = await detectDesignSystemLibraries(testDir);
      expect(result.libraries).toHaveLength(1);
      expect(result.libraries[0]!.name).toBe('shadcn-ui');
      expect(result.libraries[0]!.version).toBe('local');
      expect(result.libraries[0]!.components).toContain('Button');
      expect(result.libraries[0]!.components).toContain('Card');
    });
  });

  describe('Multiple libraries', () => {
    it('detects multiple libraries and sets hasMultipleLibraries flag', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            '@chakra-ui/react': '^2.8.0',
            '@mui/material': '^5.0.0',
          },
        }),
      );

      const result = await detectDesignSystemLibraries(testDir);
      expect(result.libraries).toHaveLength(2);
      expect(result.hasMultipleLibraries).toBe(true);
    });

    it('sorts libraries by component count', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            '@chakra-ui/react': '^2.8.0',
            antd: '^5.0.0',
          },
        }),
      );
      await writeFile(
        join(testDir, 'src/App.tsx'),
        `import { Button } from '@chakra-ui/react';
         import { Table, Form, Input, Select, DatePicker } from 'antd';`,
      );

      const result = await detectDesignSystemLibraries(testDir);
      // Ant Design should be first (more components)
      expect(result.libraries[0]!.name).toBe('ant-design');
      expect(result.libraries[1]!.name).toBe('chakra-ui');
    });
  });

  describe('Edge cases', () => {
    it('handles aliased imports correctly', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({ dependencies: { '@chakra-ui/react': '^2.8.0' } }),
      );
      await writeFile(
        join(testDir, 'src/App.tsx'),
        `import { Button as ChakraButton, Box as ChakraBox } from '@chakra-ui/react';`,
      );

      const result = await detectDesignSystemLibraries(testDir);
      // Should capture the original names, not aliases
      expect(result.libraries[0]!.components).toContain('Button');
      expect(result.libraries[0]!.components).toContain('Box');
      expect(result.libraries[0]!.components).not.toContain('ChakraButton');
    });

    it('deduplicates components across files', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({ dependencies: { '@chakra-ui/react': '^2.8.0' } }),
      );
      await writeFile(
        join(testDir, 'src/App.tsx'),
        `import { Button, Box } from '@chakra-ui/react';`,
      );
      await writeFile(
        join(testDir, 'src/Other.tsx'),
        `import { Button, Flex } from '@chakra-ui/react';`,
      );

      const result = await detectDesignSystemLibraries(testDir);
      // Button should only appear once
      expect(result.libraries[0]!.components.filter(c => c === 'Button')).toHaveLength(1);
      expect(result.libraries[0]!.componentCount).toBe(3); // Button, Box, Flex
    });

    it('ignores hooks and utilities (lowercase imports)', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({ dependencies: { '@chakra-ui/react': '^2.8.0' } }),
      );
      await writeFile(
        join(testDir, 'src/App.tsx'),
        `import { Button, useDisclosure, chakra } from '@chakra-ui/react';`,
      );

      const result = await detectDesignSystemLibraries(testDir);
      // Only Button should be captured (starts with uppercase)
      expect(result.libraries[0]!.components).toContain('Button');
      expect(result.libraries[0]!.components).not.toContain('useDisclosure');
      expect(result.libraries[0]!.components).not.toContain('chakra');
    });
  });
});
