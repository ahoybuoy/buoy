import { h } from 'preact';
import type { ReportSummary } from '../types';
import { formatTimeAgo } from '../api';

interface SummaryProps {
  summary: ReportSummary;
  generatedAt: string;
}

function getCoverageColor(percent: number): string {
  if (percent >= 90) return '#22C55E'; // green
  if (percent >= 70) return '#F59E0B'; // amber
  return '#DC2626'; // red
}

export function Summary({ summary, generatedAt }: SummaryProps) {
  const coverageColor = getCoverageColor(summary.coveragePercent);
  const progressWidth = `${summary.coveragePercent}%`;

  return (
    <div class="summary">
      <div class="coverage-header">
        <span class="coverage-percent" style={{ color: coverageColor }}>
          {summary.coveragePercent}%
        </span>
        <span class="coverage-arrow">→</span>
        <span class="coverage-target">100%</span>
      </div>

      <div class="progress-bar">
        <div
          class="progress-fill"
          style={{ width: progressWidth, backgroundColor: coverageColor }}
        />
      </div>

      <div class="coverage-label">Coverage Progress</div>

      <div class="issues-count">
        {summary.totalIssues} issues to fix
      </div>

      <div class="owner-breakdown">
        {summary.byOwner.designer > 0 && (
          <div class="owner-row">
            <span class="owner-icon">👤</span>
            <span class="owner-label">Designer</span>
            <span class="owner-count">{summary.byOwner.designer}</span>
          </div>
        )}
        {summary.byOwner.developer > 0 && (
          <div class="owner-row">
            <span class="owner-icon">💻</span>
            <span class="owner-label">Developer</span>
            <span class="owner-count">{summary.byOwner.developer}</span>
          </div>
        )}
        {summary.byOwner.agent > 0 && (
          <div class="owner-row">
            <span class="owner-icon">🤖</span>
            <span class="owner-label">Agent</span>
            <span class="owner-count">{summary.byOwner.agent}</span>
          </div>
        )}
      </div>

      <div class="last-scanned">
        Last scanned: {formatTimeAgo(generatedAt)}
      </div>
    </div>
  );
}
