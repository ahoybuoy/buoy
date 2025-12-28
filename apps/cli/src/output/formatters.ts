import chalk, { type ChalkInstance } from 'chalk';
import Table from 'cli-table3';
import type { Component, DesignToken, DriftSignal, Severity } from '@buoy/core';

// Severity colors
export function getSeverityColor(severity: Severity): ChalkInstance {
  switch (severity) {
    case 'critical':
      return chalk.red;
    case 'warning':
      return chalk.yellow;
    case 'info':
      return chalk.blue;
  }
}

export function getSeverityIcon(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return chalk.red('!');
    case 'warning':
      return chalk.yellow('~');
    case 'info':
      return chalk.blue('i');
  }
}

// Format component table
export function formatComponentTable(components: Component[]): string {
  if (components.length === 0) {
    return chalk.dim('No components found.');
  }

  const table = new Table({
    head: [
      chalk.bold('Name'),
      chalk.bold('Source'),
      chalk.bold('Props'),
      chalk.bold('Variants'),
    ],
    style: { head: [], border: [] },
  });

  for (const comp of components) {
    table.push([
      comp.name,
      comp.source.type,
      String(comp.props.length),
      String(comp.variants.length),
    ]);
  }

  return table.toString();
}

// Format token table
export function formatTokenTable(tokens: DesignToken[]): string {
  if (tokens.length === 0) {
    return chalk.dim('No tokens found.');
  }

  const table = new Table({
    head: [
      chalk.bold('Name'),
      chalk.bold('Category'),
      chalk.bold('Source'),
      chalk.bold('Value'),
    ],
    style: { head: [], border: [] },
  });

  for (const token of tokens) {
    let value = '';
    switch (token.value.type) {
      case 'color':
        value = token.value.hex;
        break;
      case 'spacing':
        value = `${token.value.value}${token.value.unit}`;
        break;
      case 'typography':
        value = `${token.value.fontFamily} ${token.value.fontSize}px`;
        break;
      default:
        value = JSON.stringify(token.value).slice(0, 30);
    }

    table.push([
      token.name,
      token.category,
      token.source.type,
      value,
    ]);
  }

  return table.toString();
}

// Format drift table
export function formatDriftTable(drifts: DriftSignal[]): string {
  if (drifts.length === 0) {
    return chalk.green('No drift detected. Your design system is aligned.');
  }

  const table = new Table({
    head: [
      '',
      chalk.bold('Type'),
      chalk.bold('Entity'),
      chalk.bold('Message'),
    ],
    style: { head: [], border: [] },
    colWidths: [3, 25, 25, 50],
    wordWrap: true,
  });

  // Sort by severity
  const sorted = [...drifts].sort((a, b) => {
    const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  for (const drift of sorted) {
    const color = getSeverityColor(drift.severity);
    const icon = getSeverityIcon(drift.severity);

    table.push([
      icon,
      color(drift.type),
      drift.source.entityName,
      drift.message,
    ]);
  }

  return table.toString();
}

// Format drift details
export function formatDriftDetails(drift: DriftSignal): string {
  const color = getSeverityColor(drift.severity);
  const lines: string[] = [];

  lines.push(color.bold(`[${drift.severity.toUpperCase()}] ${drift.type}`));
  lines.push('');
  lines.push(chalk.bold('Entity: ') + drift.source.entityName);
  lines.push(chalk.bold('Location: ') + drift.source.location);
  lines.push('');
  lines.push(chalk.bold('Message:'));
  lines.push(drift.message);

  if (drift.details.suggestions && drift.details.suggestions.length > 0) {
    lines.push('');
    lines.push(chalk.bold('Suggestions:'));
    for (const suggestion of drift.details.suggestions) {
      lines.push(`  - ${suggestion}`);
    }
  }

  if (drift.details.claudeAnalysis) {
    lines.push('');
    lines.push(chalk.bold('Analysis:'));
    lines.push(drift.details.claudeAnalysis);
  }

  return lines.join('\n');
}

// Format summary
export function formatSummary(stats: {
  components: number;
  tokens: number;
  drifts: { critical: number; warning: number; info: number };
}): string {
  const lines: string[] = [];

  lines.push(chalk.bold('Summary'));
  lines.push(`  Components: ${stats.components}`);
  lines.push(`  Tokens: ${stats.tokens}`);
  lines.push('');
  lines.push(chalk.bold('Drift Signals'));
  lines.push(`  ${chalk.red('Critical:')} ${stats.drifts.critical}`);
  lines.push(`  ${chalk.yellow('Warning:')} ${stats.drifts.warning}`);
  lines.push(`  ${chalk.blue('Info:')} ${stats.drifts.info}`);

  return lines.join('\n');
}

// Format as JSON
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// Format as markdown
export function formatMarkdown(drifts: DriftSignal[]): string {
  if (drifts.length === 0) {
    return '# Drift Report\n\nNo drift detected.';
  }

  const lines: string[] = [];
  lines.push('# Drift Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  const critical = drifts.filter(d => d.severity === 'critical');
  const warning = drifts.filter(d => d.severity === 'warning');
  const info = drifts.filter(d => d.severity === 'info');

  if (critical.length > 0) {
    lines.push('## Critical');
    lines.push('');
    for (const drift of critical) {
      lines.push(`### ${drift.source.entityName}`);
      lines.push(`- **Type:** ${drift.type}`);
      lines.push(`- **Message:** ${drift.message}`);
      lines.push('');
    }
  }

  if (warning.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const drift of warning) {
      lines.push(`### ${drift.source.entityName}`);
      lines.push(`- **Type:** ${drift.type}`);
      lines.push(`- **Message:** ${drift.message}`);
      lines.push('');
    }
  }

  if (info.length > 0) {
    lines.push('## Info');
    lines.push('');
    for (const drift of info) {
      lines.push(`### ${drift.source.entityName}`);
      lines.push(`- **Type:** ${drift.type}`);
      lines.push(`- **Message:** ${drift.message}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
