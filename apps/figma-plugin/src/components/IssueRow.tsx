import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { DriftSignal } from '../types';
import { DRIFT_TYPE_LABELS, SEVERITY_COLORS } from '../types';
import { formatTimeAgo } from '../api';

interface IssueRowProps {
  issue: DriftSignal;
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical':
      return '🔴';
    case 'warning':
      return '⚠️';
    case 'info':
      return 'ℹ️';
    default:
      return '•';
  }
}

export function IssueRow({ issue }: IssueRowProps) {
  const [expanded, setExpanded] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(issue.actionRequired);
    parent.postMessage({ pluginMessage: { type: 'copy' } }, '*');
  };

  return (
    <div
      class={`issue-row ${expanded ? 'expanded' : ''}`}
      style={{ borderLeftColor: SEVERITY_COLORS[issue.severity] }}
    >
      <div class="issue-compact" onClick={() => setExpanded(!expanded)}>
        <div class="issue-header">
          <span class="issue-icon">{getSeverityIcon(issue.severity)}</span>
          <span class="issue-message">{issue.message}</span>
        </div>
        <div class="issue-location">{issue.source.location}</div>
      </div>

      {expanded && (
        <div class="issue-details">
          {/* Action Required - prominent call to action */}
          <div class="action-required-box">
            <span class="action-required-label">Action Required</span>
            <div class="action-required-text">{issue.actionRequired}</div>
            <button class="copy-action-button" onClick={handleCopy}>
              📋 Copy
            </button>
          </div>

          <div class="detail-row">
            <span class="detail-label">Type:</span>
            <span class="detail-value">{DRIFT_TYPE_LABELS[issue.type]}</span>
          </div>

          {issue.details.actual && (
            <div class="detail-row">
              <span class="detail-label">Found:</span>
              <span class="detail-value code">{String(issue.details.actual)}</span>
            </div>
          )}

          {issue.details.expected && (
            <div class="detail-row">
              <span class="detail-label">Expected:</span>
              <span class="detail-value code">{String(issue.details.expected)}</span>
            </div>
          )}

          {issue.details.suggestions && issue.details.suggestions.length > 0 && (
            <div class="detail-section">
              <span class="detail-label">Additional suggestions:</span>
              <div class="suggestions-list">
                {issue.details.suggestions.map((suggestion, i) => (
                  <div key={i} class="suggestion-item">{suggestion}</div>
                ))}
              </div>
            </div>
          )}

          {issue.details.gitContext?.blame && (
            <div class="detail-section">
              <span class="detail-label">Last modified by:</span>
              <div class="git-info">
                {issue.details.gitContext.blame.author}
                {' '}({formatTimeAgo(issue.details.gitContext.blame.date)})
                <div class="commit-info">
                  <span class="commit-hash">{issue.details.gitContext.blame.commitHash}</span>
                  {' '}{issue.details.gitContext.blame.commitMessage}
                </div>
              </div>
            </div>
          )}

          {issue.details.affectedFiles && issue.details.affectedFiles.length > 0 && (
            <div class="detail-section">
              <span class="detail-label">Affected files ({issue.details.affectedFiles.length}):</span>
              <div class="affected-files">
                {issue.details.affectedFiles.map((file) => (
                  <div key={file} class="affected-file">{file}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
