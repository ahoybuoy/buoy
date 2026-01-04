import type { ReportResponse } from './types';

// Configure your Buoy API endpoint here
const API_BASE_URL = 'https://buoy.yourcompany.com';

// Mock data for development
const MOCK_REPORT: ReportResponse = {
  generatedAt: new Date().toISOString(),
  summary: {
    coveragePercent: 67,
    totalIssues: 23,
    bySeverity: {
      critical: 3,
      warning: 15,
      info: 5,
    },
    byOwner: {
      designer: 8,
      developer: 12,
      agent: 3,
    },
  },
  issues: [
    // Designer issues
    {
      id: 'drift:missing-state:button-disabled',
      type: 'missing-documentation',
      severity: 'warning',
      owner: 'designer',
      source: {
        entityType: 'component',
        entityId: 'button',
        entityName: 'Button',
        location: 'Figma: Components / Button',
      },
      message: 'Missing disabled state spec',
      actionRequired: 'Add disabled state variant to Button component in Figma',
      details: {
        expected: 'Disabled state should be documented',
        actual: 'Devs implementing 3 different ways',
        suggestions: [
          'Add disabled variant with opacity: 0.5 and cursor: not-allowed',
        ],
        affectedFiles: [
          'src/components/Button.tsx',
          'src/components/IconButton.tsx',
          'src/components/CardButton.tsx',
        ],
      },
      detectedAt: new Date().toISOString(),
    },
    {
      id: 'drift:ambiguous-tokens:modal-spacing',
      type: 'value-divergence',
      severity: 'warning',
      owner: 'designer',
      source: {
        entityType: 'component',
        entityId: 'modal',
        entityName: 'Modal',
        location: 'Figma: Components / Modal',
      },
      message: 'Spacing tokens need clarification',
      actionRequired: 'Document spacing tokens for Modal padding in Figma spec',
      details: {
        expected: 'Consistent spacing token usage',
        actual: 'Devs using 16px, 20px, 24px inconsistently',
        suggestions: [
          'Add spacing annotation: padding should use spacing-lg (24px)',
        ],
      },
      detectedAt: new Date().toISOString(),
    },
    {
      id: 'drift:undocumented-variants:card',
      type: 'missing-documentation',
      severity: 'info',
      owner: 'designer',
      source: {
        entityType: 'component',
        entityId: 'card',
        entityName: 'Card',
        location: 'Figma: Components / Card',
      },
      message: '3 variants exist in code but not in Figma',
      actionRequired: 'Add elevated, outlined, and ghost variants to Card in Figma',
      details: {
        expected: 'All variants documented',
        actual: 'Only default variant in Figma',
        suggestions: [
          'Add Card/Elevated variant',
          'Add Card/Outlined variant',
          'Add Card/Ghost variant',
        ],
      },
      detectedAt: new Date().toISOString(),
    },

    // Developer issues
    {
      id: 'drift:framework-sprawl:radix-dropdown',
      type: 'framework-sprawl',
      severity: 'critical',
      owner: 'developer',
      source: {
        entityType: 'component',
        entityId: 'select',
        entityName: 'CustomSelect',
        location: 'src/components/Select.tsx:8',
      },
      message: 'Using @radix-ui/react-dropdown-menu instead of design system',
      actionRequired: 'Replace @radix-ui/react-dropdown-menu with <Select> from @company/design-system',
      details: {
        expected: '<Select> from @company/design-system',
        actual: '@radix-ui/react-dropdown-menu',
        suggestions: [
          'Import { Select } from "@company/design-system"',
          'Replace <DropdownMenu> with <Select>',
        ],
        affectedFiles: [
          'src/components/Select.tsx',
          'src/pages/Settings.tsx',
          'src/pages/Profile.tsx',
        ],
        gitContext: {
          blame: {
            author: 'Jordan Smith',
            email: 'jordan@company.com',
            date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            commitHash: 'e4f5g6h',
            commitMessage: 'Quick fix for dropdown',
          },
        },
      },
      detectedAt: new Date().toISOString(),
    },
    {
      id: 'drift:hardcoded-value:button-color',
      type: 'hardcoded-value',
      severity: 'warning',
      owner: 'developer',
      source: {
        entityType: 'component',
        entityId: 'button',
        entityName: 'Button',
        location: 'src/components/Button.tsx:42',
      },
      message: 'Hardcoded color #3B82F6 in 7 files',
      actionRequired: 'Replace #3B82F6 with var(--color-blue-500)',
      details: {
        expected: 'var(--color-blue-500)',
        actual: '#3B82F6',
        suggestions: ['Replace #3B82F6 with var(--color-blue-500)'],
        tokenSuggestions: ['#3B82F6 → blue-500 (98% match)'],
        affectedFiles: [
          'src/components/Button.tsx',
          'src/components/Link.tsx',
          'src/components/Badge.tsx',
          'src/pages/Home.tsx',
          'src/pages/Dashboard.tsx',
          'src/features/auth/Login.tsx',
          'src/features/settings/Profile.tsx',
        ],
        gitContext: {
          blame: {
            author: 'Alex Chen',
            email: 'alex@company.com',
            date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            commitHash: 'a1b2c3d',
            commitMessage: 'Add hover states to button',
          },
        },
      },
      detectedAt: new Date().toISOString(),
    },
    {
      id: 'drift:accessibility-conflict:modal-focus',
      type: 'accessibility-conflict',
      severity: 'critical',
      owner: 'developer',
      source: {
        entityType: 'component',
        entityId: 'modal',
        entityName: 'Modal',
        location: 'src/components/Modal.tsx:67',
      },
      message: 'Modal missing focus trap',
      actionRequired: 'Wrap Modal content with <FocusTrap> from design system',
      details: {
        expected: 'Focus trapped within modal for keyboard users',
        actual: 'Focus escapes to background content',
        suggestions: [
          'Import { FocusTrap } from "@company/design-system"',
          'Wrap modal content: <FocusTrap>{children}</FocusTrap>',
        ],
      },
      detectedAt: new Date().toISOString(),
    },
    {
      id: 'drift:hardcoded-value:card-radius',
      type: 'hardcoded-value',
      severity: 'warning',
      owner: 'developer',
      source: {
        entityType: 'component',
        entityId: 'card',
        entityName: 'Card',
        location: 'src/components/Card.tsx:15',
      },
      message: 'Wrong border-radius on Card',
      actionRequired: 'Replace borderRadius: 8 with var(--radius-lg)',
      details: {
        expected: 'var(--radius-lg) (12px)',
        actual: '8px',
        tokenSuggestions: ['8px → radius-md (but spec says radius-lg)'],
      },
      detectedAt: new Date().toISOString(),
    },

    // Agent mistakes
    {
      id: 'drift:agent:ignored-design-system',
      type: 'framework-sprawl',
      severity: 'critical',
      owner: 'agent',
      source: {
        entityType: 'component',
        entityId: 'datepicker',
        entityName: 'DatePicker',
        location: 'src/components/DatePicker.tsx:1',
      },
      message: 'AI agent ignored design system, imported react-datepicker',
      actionRequired: 'Remove react-datepicker, use <DatePicker> from @company/design-system',
      details: {
        expected: '<DatePicker> from @company/design-system',
        actual: 'react-datepicker (external library)',
        suggestions: [
          'Remove: npm uninstall react-datepicker',
          'Import { DatePicker } from "@company/design-system"',
        ],
        gitContext: {
          blame: {
            author: 'Claude',
            email: 'ai@anthropic.com',
            date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            commitHash: 'ai12345',
            commitMessage: 'Add date picker to form',
          },
        },
      },
      detectedAt: new Date().toISOString(),
    },
    {
      id: 'drift:agent:inline-styles',
      type: 'hardcoded-value',
      severity: 'warning',
      owner: 'agent',
      source: {
        entityType: 'component',
        entityId: 'alert',
        entityName: 'CustomAlert',
        location: 'src/components/CustomAlert.tsx:12',
      },
      message: 'AI agent used inline styles instead of design tokens',
      actionRequired: 'Replace inline styles with design system tokens and classes',
      details: {
        expected: 'className="alert alert-warning" or design tokens',
        actual: 'style={{ backgroundColor: "#FEF3C7", padding: "16px" }}',
        suggestions: [
          'Use <Alert variant="warning"> from design system',
          'Or use tokens: backgroundColor: var(--color-warning-100)',
        ],
      },
      detectedAt: new Date().toISOString(),
    },
    {
      id: 'drift:agent:custom-component',
      type: 'orphaned-component',
      severity: 'warning',
      owner: 'agent',
      source: {
        entityType: 'component',
        entityId: 'tooltip',
        entityName: 'MyTooltip',
        location: 'src/components/MyTooltip.tsx:1',
      },
      message: 'AI agent created custom Tooltip when one exists',
      actionRequired: 'Delete MyTooltip.tsx, use <Tooltip> from @company/design-system',
      details: {
        expected: '<Tooltip> from @company/design-system',
        actual: 'Custom MyTooltip component (unnecessary)',
        suggestions: [
          'Delete src/components/MyTooltip.tsx',
          'Update imports to use design system Tooltip',
        ],
      },
      detectedAt: new Date().toISOString(),
    },
  ],
};

// Use mock data in development
const USE_MOCK = true;

export async function fetchReport(): Promise<ReportResponse> {
  if (USE_MOCK) {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    return MOCK_REPORT;
  }

  const response = await fetch(`${API_BASE_URL}/api/report`);

  if (!response.ok) {
    throw new Error(`Failed to fetch report: ${response.statusText}`);
  }

  return response.json();
}

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  return 'Just now';
}
