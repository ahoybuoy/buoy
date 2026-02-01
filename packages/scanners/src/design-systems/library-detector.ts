/**
 * Design System Library Detector
 * Detects which design system libraries are in use and which components are imported.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';

/**
 * Information about a detected design system library
 */
export interface DesignSystemLibrary {
  /** Normalized library name */
  name: string;
  /** Primary package name */
  package: string;
  /** Version from package.json */
  version: string;
  /** Components imported from this library */
  components: string[];
  /** Count of unique components */
  componentCount: number;
}

/**
 * Result of library detection
 */
export interface LibraryDetectionResult {
  /** Detected libraries with usage details */
  libraries: DesignSystemLibrary[];
  /** True if multiple UI libraries detected (potential drift) */
  hasMultipleLibraries: boolean;
}

/**
 * Configuration for each supported design system library
 */
interface LibraryConfig {
  /** Package names to look for in package.json */
  packages: string[];
  /** Regex pattern to match package names (for scoped packages) */
  packagePattern?: RegExp;
  /** Regex to find imports in source files */
  importPattern: RegExp;
  /** Regex to extract component names from imports */
  componentPattern: RegExp;
  /** If true, component name comes from package name (e.g., @radix-ui/react-dialog → Dialog) */
  componentFromPackage?: boolean;
}

/**
 * Supported design system libraries
 */
export const DESIGN_SYSTEM_LIBRARIES: Record<string, LibraryConfig> = {
  'chakra-ui': {
    packages: ['@chakra-ui/react', '@chakra-ui/core'],
    importPattern: /@chakra-ui\/(react|core)/,
    componentPattern: /import\s+\{([^}]+)\}\s+from\s+['"]@chakra-ui\/(react|core)['"]/g,
  },
  'radix-ui': {
    packages: [],
    packagePattern: /^@radix-ui\/react-/,
    importPattern: /@radix-ui\/react-/,
    componentPattern: /from\s+['"]@radix-ui\/react-([a-z-]+)['"]/gi,
    componentFromPackage: true,
  },
  'shadcn-ui': {
    packages: [],
    importPattern: /@\/components\/ui\//,
    componentPattern: /from\s+['"]@\/components\/ui\/([^'"]+)['"]/g,
    componentFromPackage: true,
  },
  'mui': {
    packages: ['@mui/material', '@mui/core', '@material-ui/core'],
    importPattern: /@mui\/(material|core)|@material-ui\/core/,
    componentPattern: /import\s+\{([^}]+)\}\s+from\s+['"]@mui\/(material|core)['"]/g,
  },
  'ant-design': {
    packages: ['antd'],
    importPattern: /['"]antd['"]/,
    componentPattern: /import\s+\{([^}]+)\}\s+from\s+['"]antd['"]/g,
  },
  'mantine': {
    packages: ['@mantine/core', '@mantine/hooks'],
    importPattern: /@mantine\/(core|hooks)/,
    componentPattern: /import\s+\{([^}]+)\}\s+from\s+['"]@mantine\/(core|hooks)['"]/g,
  },
};

/**
 * Detect design system libraries in a project
 */
export async function detectDesignSystemLibraries(
  projectRoot: string,
): Promise<LibraryDetectionResult> {
  // Read package.json
  const packageJsonPath = join(projectRoot, 'package.json');
  let packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

  try {
    const content = await readFile(packageJsonPath, 'utf-8');
    packageJson = JSON.parse(content);
  } catch {
    // No package.json, return empty result
    return { libraries: [], hasMultipleLibraries: false };
  }

  const allDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  // Detect which libraries are installed
  const detectedLibraries: Map<string, { package: string; version: string }> = new Map();

  for (const [libraryName, config] of Object.entries(DESIGN_SYSTEM_LIBRARIES)) {
    // Check explicit package names
    for (const pkg of config.packages) {
      if (allDependencies[pkg]) {
        detectedLibraries.set(libraryName, {
          package: pkg,
          version: allDependencies[pkg],
        });
        break;
      }
    }

    // Check package pattern (for scoped packages like @radix-ui/react-*)
    if (config.packagePattern && !detectedLibraries.has(libraryName)) {
      for (const [pkg, version] of Object.entries(allDependencies)) {
        if (config.packagePattern.test(pkg)) {
          detectedLibraries.set(libraryName, {
            package: pkg.replace(/-\w+$/, '-*'), // Normalize to wildcard
            version,
          });
          break;
        }
      }
    }
  }

  // Also check for shadcn/ui by looking for the components/ui directory convention
  // This is detected during import scanning, not package.json

  // Scan source files for imports
  const sourceFiles = await glob('**/*.{tsx,jsx,ts,js}', {
    cwd: projectRoot,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**'],
    absolute: true,
  });

  // Track components per library
  const libraryComponents: Map<string, Set<string>> = new Map();

  for (const file of sourceFiles) {
    let content: string;
    try {
      content = await readFile(file, 'utf-8');
    } catch {
      continue;
    }

    for (const [libraryName, config] of Object.entries(DESIGN_SYSTEM_LIBRARIES)) {
      // Check if this file has imports from this library
      if (!config.importPattern.test(content)) {
        continue;
      }

      // For shadcn-ui, mark as detected if we find the import pattern
      if (libraryName === 'shadcn-ui' && !detectedLibraries.has(libraryName)) {
        detectedLibraries.set(libraryName, {
          package: '@/components/ui/*',
          version: 'local',
        });
      }

      // Extract component names
      if (!libraryComponents.has(libraryName)) {
        libraryComponents.set(libraryName, new Set());
      }

      const components = libraryComponents.get(libraryName)!;

      // Reset regex state
      config.componentPattern.lastIndex = 0;

      let match;
      while ((match = config.componentPattern.exec(content)) !== null) {
        if (config.componentFromPackage) {
          // Component name is in the match (e.g., "dialog" from @radix-ui/react-dialog)
          const componentName = match[1];
          if (componentName) {
            // Convert kebab-case to PascalCase
            const pascalName = componentName
              .split('-')
              .map(part => part.charAt(0).toUpperCase() + part.slice(1))
              .join('');
            components.add(pascalName);
          }
        } else {
          // Components are in a destructured import
          const importList = match[1];
          if (importList) {
            // Parse the import list: { Button, Box, Flex as F }
            const names = importList.split(',').map(s => {
              const trimmed = s.trim();
              // Handle "Foo as Bar" → take "Foo"
              const asIndex = trimmed.indexOf(' as ');
              return asIndex > 0 ? trimmed.slice(0, asIndex).trim() : trimmed;
            }).filter(name =>
              // Filter out non-component imports (hooks, utilities)
              name && /^[A-Z]/.test(name)
            );

            for (const name of names) {
              components.add(name);
            }
          }
        }
      }
    }
  }

  // Build result
  const libraries: DesignSystemLibrary[] = [];

  for (const [libraryName, info] of detectedLibraries) {
    const components = libraryComponents.get(libraryName);
    const componentList = components ? Array.from(components).sort() : [];

    libraries.push({
      name: libraryName,
      package: info.package,
      version: info.version,
      components: componentList,
      componentCount: componentList.length,
    });
  }

  // Sort by component count (most used first)
  libraries.sort((a, b) => b.componentCount - a.componentCount);

  return {
    libraries,
    hasMultipleLibraries: libraries.length > 1,
  };
}
