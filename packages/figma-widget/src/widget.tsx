/**
 * Buoy Figma Widget
 *
 * A canvas-embedded widget that displays design system health.
 * Lives on the page and shows live status at a glance.
 */

const { widget } = figma;
const {
  AutoLayout,
  Text,
  Rectangle,
  SVG,
  useSyncedState,
  usePropertyMenu,
  useEffect,
} = widget;

// ============================================================================
// Types
// ============================================================================

interface ColorToken {
  name: string;
  value: string;
  opacity: number;
}

interface TypographyToken {
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
}

interface SpacingValue {
  value: number;
  usageCount: number;
}

interface ComponentInfo {
  name: string;
  instanceCount: number;
}

interface HealthBreakdown {
  colorScore: number;
  typographyScore: number;
  spacingScore: number;
  componentScore: number;
}

interface AnalysisData {
  colorCount: number;
  typographyCount: number;
  spacingCount: number;
  componentCount: number;
  duplicateColors: number;
  orphanedText: number;
  orphanedInstances: number;
  hasSpacingScale: boolean;
  health: {
    score: number;
    breakdown: HealthBreakdown;
  };
  analyzedAt: string;
}

// ============================================================================
// Analysis Functions
// ============================================================================

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function colorDistance(hex1: string, hex2: string): number {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

async function runAnalysis(): Promise<AnalysisData> {
  // Analyze colors
  const paintStyles = await figma.getLocalPaintStylesAsync();
  const colors: ColorToken[] = [];
  for (const style of paintStyles) {
    const paint = style.paints[0];
    if (paint && paint.type === 'SOLID') {
      colors.push({
        name: style.name,
        value: rgbToHex(paint.color.r, paint.color.g, paint.color.b),
        opacity: paint.opacity !== undefined ? paint.opacity : 1,
      });
    }
  }

  // Find duplicate colors
  let duplicateColors = 0;
  const processed = new Set<string>();
  for (const color1 of colors) {
    if (processed.has(color1.value)) continue;
    const similar = colors.filter(
      (c) => c.value !== color1.value && colorDistance(color1.value, c.value) < 15
    );
    if (similar.length > 0) {
      duplicateColors++;
      [color1, ...similar].forEach((c) => processed.add(c.value));
    }
  }

  // Analyze typography
  const textStyles = await figma.getLocalTextStylesAsync();
  const typography: TypographyToken[] = textStyles.map((style) => ({
    name: style.name,
    fontFamily: style.fontName.family,
    fontSize: style.fontSize,
    fontWeight: 400,
  }));

  // Count orphaned text
  const textNodes = figma.currentPage.findAll((node) => node.type === 'TEXT') as TextNode[];
  let orphanedText = 0;
  for (const node of textNodes) {
    if (!node.textStyleId || node.textStyleId === '') {
      orphanedText++;
    }
  }

  // Analyze spacing
  const spacingCounts = new Map<number, number>();
  const frames = figma.currentPage.findAll(
    (node) => node.type === 'FRAME' && 'layoutMode' in node && node.layoutMode !== 'NONE'
  ) as FrameNode[];

  for (const frame of frames) {
    if (frame.itemSpacing > 0) {
      spacingCounts.set(frame.itemSpacing, (spacingCounts.get(frame.itemSpacing) || 0) + 1);
    }
    if (frame.paddingTop > 0) {
      spacingCounts.set(frame.paddingTop, (spacingCounts.get(frame.paddingTop) || 0) + 1);
    }
  }

  const spacingValues = Array.from(spacingCounts.entries())
    .map(([value, usageCount]) => ({ value, usageCount }))
    .sort((a, b) => b.usageCount - a.usageCount);

  const hasSpacingScale =
    spacingValues.length > 0 &&
    spacingValues.slice(0, 5).every((v) => v.value % 4 === 0 || v.value % 8 === 0);

  // Analyze components
  const components = figma.currentPage.findAll(
    (node) => node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
  ) as (ComponentNode | ComponentSetNode)[];

  const allInstances = figma.currentPage.findAll(
    (node) => node.type === 'INSTANCE'
  ) as InstanceNode[];

  let orphanedInstances = 0;
  for (const instance of allInstances) {
    const mainComp = await instance.getMainComponentAsync();
    if (!mainComp) {
      orphanedInstances++;
    }
  }

  // Calculate health scores
  const colorScore = Math.max(0, 100 - duplicateColors * 10);
  const totalText = typography.length + orphanedText;
  const typographyScore = totalText > 0 ? Math.round((typography.length / Math.max(1, totalText)) * 100) : 100;
  const spacingScore = hasSpacingScale ? 100 : spacingValues.length > 0 ? 60 : 0;
  const totalInstances = allInstances.length;
  const componentScore = totalInstances > 0
    ? Math.round(((totalInstances - orphanedInstances) / Math.max(1, totalInstances)) * 100)
    : 100;

  const score = Math.round(
    colorScore * 0.3 + typographyScore * 0.25 + spacingScore * 0.2 + componentScore * 0.25
  );

  return {
    colorCount: colors.length,
    typographyCount: typography.length,
    spacingCount: spacingValues.length,
    componentCount: components.length,
    duplicateColors,
    orphanedText,
    orphanedInstances,
    hasSpacingScale,
    health: {
      score,
      breakdown: {
        colorScore,
        typographyScore,
        spacingScore,
        componentScore,
      },
    },
    analyzedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Widget Component
// ============================================================================

function getScoreColor(score: number): string {
  if (score >= 90) return '#84CC16';
  if (score >= 70) return '#EAB308';
  if (score >= 50) return '#F97316';
  return '#EF4444';
}

function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Needs Work';
  return 'Early Stage';
}

function BuoyWidget() {
  const [data, setData] = useSyncedState<AnalysisData | null>('analysisData', null);
  const [isAnalyzing, setIsAnalyzing] = useSyncedState<boolean>('isAnalyzing', false);

  usePropertyMenu(
    [
      {
        itemType: 'action',
        propertyName: 'refresh',
        tooltip: 'Refresh Analysis',
      },
    ],
    async ({ propertyName }) => {
      if (propertyName === 'refresh') {
        await analyze();
      }
    }
  );

  async function analyze() {
    setIsAnalyzing(true);
    try {
      const result = await runAnalysis();
      setData(result);
    } catch (error) {
      console.error('Analysis failed:', error);
    }
    setIsAnalyzing(false);
  }

  // Build issues list
  const issues: string[] = [];
  if (data) {
    if (data.duplicateColors > 0) {
      issues.push(`${data.duplicateColors} similar colors`);
    }
    if (data.orphanedText > 0) {
      issues.push(`${data.orphanedText} unstyled text`);
    }
    if (data.orphanedInstances > 0) {
      issues.push(`${data.orphanedInstances} detached instances`);
    }
    if (!data.hasSpacingScale && data.spacingCount > 0) {
      issues.push('No spacing scale');
    }
  }

  // Not analyzed yet
  if (!data) {
    return (
      <AutoLayout
        direction="vertical"
        spacing={16}
        padding={24}
        cornerRadius={12}
        fill="#FFFFFF"
        stroke="#E7E5E4"
        strokeWidth={1}
        effect={{
          type: 'drop-shadow',
          color: { r: 0, g: 0, b: 0, a: 0.08 },
          offset: { x: 0, y: 2 },
          blur: 8,
        }}
        width={280}
      >
        <AutoLayout direction="horizontal" spacing={8} verticalAlignItems="center">
          <Text fontSize={20}>🛟</Text>
          <Text fontSize={16} fontWeight={600} fill="#1C1917">
            Buoy
          </Text>
        </AutoLayout>

        <Text fontSize={12} fill="#57534E" width="fill-parent">
          Analyze your design system to track health and catch drift in code.
        </Text>

        <AutoLayout
          direction="horizontal"
          spacing={8}
          padding={{ vertical: 12, horizontal: 16 }}
          cornerRadius={8}
          fill="#0EA5E9"
          horizontalAlignItems="center"
          width="fill-parent"
          onClick={analyze}
        >
          <Text fontSize={14} fontWeight={500} fill="#FFFFFF">
            {isAnalyzing ? 'Analyzing...' : 'Analyze Design System'}
          </Text>
        </AutoLayout>
      </AutoLayout>
    );
  }

  // Show results
  return (
    <AutoLayout
      direction="vertical"
      spacing={16}
      padding={24}
      cornerRadius={12}
      fill="#FFFFFF"
      stroke="#E7E5E4"
      strokeWidth={1}
      effect={{
        type: 'drop-shadow',
        color: { r: 0, g: 0, b: 0, a: 0.08 },
        offset: { x: 0, y: 2 },
        blur: 8,
      }}
      width={280}
    >
      {/* Header */}
      <AutoLayout direction="horizontal" spacing={8} verticalAlignItems="center" width="fill-parent">
        <Text fontSize={20}>🛟</Text>
        <Text fontSize={16} fontWeight={600} fill="#1C1917">
          Buoy
        </Text>
        <AutoLayout width="fill-parent" />
        <Text fontSize={10} fill="#A8A29E">
          {new Date(data.analyzedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </AutoLayout>

      {/* Health Score */}
      <AutoLayout
        direction="vertical"
        spacing={4}
        padding={16}
        cornerRadius={8}
        fill="#FAFAF9"
        width="fill-parent"
        horizontalAlignItems="center"
      >
        <Text fontSize={36} fontWeight={700} fill={getScoreColor(data.health.score)}>
          {data.health.score}%
        </Text>
        <Text fontSize={12} fill="#57534E">
          {getScoreLabel(data.health.score)}
        </Text>
      </AutoLayout>

      {/* Stats Grid */}
      <AutoLayout direction="horizontal" spacing={8} width="fill-parent">
        <AutoLayout
          direction="vertical"
          spacing={2}
          padding={12}
          cornerRadius={6}
          fill="#F5F5F4"
          width="fill-parent"
          horizontalAlignItems="center"
        >
          <Text fontSize={18} fontWeight={600} fill={getScoreColor(data.health.breakdown.colorScore)}>
            {data.colorCount}
          </Text>
          <Text fontSize={10} fill="#A8A29E">
            Colors
          </Text>
        </AutoLayout>
        <AutoLayout
          direction="vertical"
          spacing={2}
          padding={12}
          cornerRadius={6}
          fill="#F5F5F4"
          width="fill-parent"
          horizontalAlignItems="center"
        >
          <Text fontSize={18} fontWeight={600} fill={getScoreColor(data.health.breakdown.typographyScore)}>
            {data.typographyCount}
          </Text>
          <Text fontSize={10} fill="#A8A29E">
            Type
          </Text>
        </AutoLayout>
        <AutoLayout
          direction="vertical"
          spacing={2}
          padding={12}
          cornerRadius={6}
          fill="#F5F5F4"
          width="fill-parent"
          horizontalAlignItems="center"
        >
          <Text fontSize={18} fontWeight={600} fill={getScoreColor(data.health.breakdown.componentScore)}>
            {data.componentCount}
          </Text>
          <Text fontSize={10} fill="#A8A29E">
            Comp
          </Text>
        </AutoLayout>
      </AutoLayout>

      {/* Issues */}
      {issues.length > 0 && (
        <AutoLayout
          direction="vertical"
          spacing={6}
          padding={12}
          cornerRadius={6}
          fill="#FFFBEB"
          width="fill-parent"
        >
          <Text fontSize={11} fontWeight={500} fill="#B45309">
            Recommendations
          </Text>
          {issues.slice(0, 3).map((issue, i) => (
            <Text key={i} fontSize={11} fill="#57534E">
              • {issue}
            </Text>
          ))}
        </AutoLayout>
      )}

      {/* No issues */}
      {issues.length === 0 && (
        <AutoLayout
          direction="vertical"
          spacing={4}
          padding={12}
          cornerRadius={6}
          fill="#F0FDF4"
          width="fill-parent"
        >
          <Text fontSize={11} fontWeight={500} fill="#16A34A">
            ✓ Looking great!
          </Text>
          <Text fontSize={11} fill="#57534E">
            Your design system is well-structured.
          </Text>
        </AutoLayout>
      )}

      {/* Refresh Button */}
      <AutoLayout
        direction="horizontal"
        spacing={8}
        padding={{ vertical: 10, horizontal: 16 }}
        cornerRadius={6}
        fill="#FFFFFF"
        stroke="#E7E5E4"
        strokeWidth={1}
        horizontalAlignItems="center"
        width="fill-parent"
        onClick={analyze}
      >
        <Text fontSize={12} fontWeight={500} fill="#1C1917" horizontalAlignText="center" width="fill-parent">
          {isAnalyzing ? 'Analyzing...' : 'Refresh'}
        </Text>
      </AutoLayout>
    </AutoLayout>
  );
}

widget.register(BuoyWidget);
