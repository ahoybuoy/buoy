import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { collectUsages } from './usages.js';

async function makeTempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'buoy-usages-'));
}

describe('collectUsages', () => {
  let projectRoot: string | undefined;

  afterEach(async () => {
    if (projectRoot) {
      await rm(projectRoot, { recursive: true, force: true });
      projectRoot = undefined;
    }
  });

  it('counts semantic Tailwind utility classes as token usage', async () => {
    projectRoot = await makeTempProject();
    await mkdir(join(projectRoot, 'app'), { recursive: true });
    await writeFile(
      join(projectRoot, 'app', 'page.tsx'),
      `
      export function Page() {
        return (
          <div className="bg-surface text-foreground dark:hover:bg-surface/80">
            Hello
          </div>
        );
      }
      `,
      'utf-8',
    );

    const result = await collectUsages({
      projectRoot,
      knownTokens: ['--surface', '--foreground'],
    });

    const names = result.tokenUsages.map((u) => u.tokenName);
    expect(names).toContain('surface');
    expect(names).toContain('foreground');
    expect(result.tokenUsages.some((u) => u.usageType === 'tailwind')).toBe(true);
  });

  it('matches semantic Tailwind utility usage against tw-* known token names', async () => {
    projectRoot = await makeTempProject();
    await mkdir(join(projectRoot, 'app'), { recursive: true });
    await writeFile(
      join(projectRoot, 'app', 'page.tsx'),
      `<div className="bg-surface text-foreground" />`,
      'utf-8',
    );

    const result = await collectUsages({
      projectRoot,
      knownTokens: ['tw-surface', 'tw-foreground'],
    });

    expect(result.tokenUsages.map((u) => u.tokenName)).toEqual(
      expect.arrayContaining(['surface', 'foreground']),
    );
  });

  it('does not treat built-in Tailwind palette classes as semantic tokens', async () => {
    projectRoot = await makeTempProject();
    await mkdir(join(projectRoot, 'components'), { recursive: true });
    await writeFile(
      join(projectRoot, 'components', 'Button.tsx'),
      `<button className="bg-slate-900 text-white">OK</button>`,
      'utf-8',
    );

    const result = await collectUsages({
      projectRoot,
      knownTokens: ['--surface', '--foreground'],
    });

    expect(result.tokenUsages).toHaveLength(0);
  });
});
