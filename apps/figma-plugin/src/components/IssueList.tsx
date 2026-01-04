import { h } from 'preact';
import type { DriftSignal, IssueOwner } from '../types';
import { OWNER_LABELS } from '../types';
import { IssueRow } from './IssueRow';

interface IssueListProps {
  issues: DriftSignal[];
}

// Group issues by owner
function groupByOwner(issues: DriftSignal[]): Record<IssueOwner, DriftSignal[]> {
  const groups: Record<IssueOwner, DriftSignal[]> = {
    designer: [],
    developer: [],
    agent: [],
  };

  for (const issue of issues) {
    groups[issue.owner].push(issue);
  }

  // Sort each group by severity
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  for (const owner of Object.keys(groups) as IssueOwner[]) {
    groups[owner].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  return groups;
}

export function IssueList({ issues }: IssueListProps) {
  if (issues.length === 0) {
    return (
      <div class="issue-list empty">
        <div class="empty-state">
          <span class="empty-icon">✨</span>
          <span class="empty-text">No issues found!</span>
          <span class="empty-subtext">Your design system is at 100% coverage.</span>
        </div>
      </div>
    );
  }

  const grouped = groupByOwner(issues);
  const owners: IssueOwner[] = ['designer', 'developer', 'agent'];

  return (
    <div class="issue-list">
      {owners.map((owner) => {
        const ownerIssues = grouped[owner];
        if (ownerIssues.length === 0) return null;

        const { icon, label } = OWNER_LABELS[owner];

        return (
          <div key={owner} class="issue-group">
            <div class="issue-group-header">
              <span class="issue-group-icon">{icon}</span>
              <span class="issue-group-label">{label}</span>
              <span class="issue-group-count">({ownerIssues.length})</span>
            </div>
            {ownerIssues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
