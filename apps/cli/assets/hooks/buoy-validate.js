#!/usr/bin/env node
/**
 * Buoy PostToolUse Hook - Self-Validating Agent
 *
 * Runs after Edit/Write tool completes to check for design drift.
 * Returns structured feedback that Claude can use to self-correct.
 *
 * @see https://code.claude.com/docs/en/hooks
 */

const { execSync } = require('child_process');
const path = require('path');

// Read hook input from stdin
let inputData = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(inputData);
    const result = validateFile(input);

    if (result) {
      console.log(JSON.stringify(result));
    }

    // Always exit 0 - we want to provide feedback, not block
    process.exit(0);
  } catch (err) {
    // Silent failure - don't interrupt Claude's work
    process.exit(0);
  }
});

/**
 * Check if a file is a UI component file we should validate
 */
function isUIFile(filePath) {
  if (!filePath) return false;

  const uiExtensions = [
    '.tsx', '.jsx', '.vue', '.svelte',
    '.component.ts', '.component.html'
  ];

  const excludePatterns = [
    /\.test\./,
    /\.spec\./,
    /\.stories\./,
    /node_modules/,
    /\.d\.ts$/,
    /\.config\./
  ];

  const ext = path.extname(filePath);
  const isUIExt = uiExtensions.some(e => filePath.endsWith(e));
  const isExcluded = excludePatterns.some(p => p.test(filePath));

  return isUIExt && !isExcluded;
}

/**
 * Validate a file for design drift
 */
function validateFile(input) {
  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path;

  // Only validate UI files
  if (!isUIFile(filePath)) {
    return null;
  }

  try {
    // Run buoy check with AI feedback format
    const output = execSync(
      'npx buoy check --format ai-feedback --json 2>/dev/null',
      {
        encoding: 'utf8',
        cwd: input.cwd || process.cwd(),
        timeout: 30000
      }
    );

    const checkResult = JSON.parse(output);

    // Filter to only issues in the modified file
    const fileIssues = (checkResult.issues || []).filter(
      issue => issue.file === filePath || issue.file?.endsWith(path.basename(filePath))
    );

    if (fileIssues.length === 0) {
      return null; // No issues, no feedback needed
    }

    // Format feedback for Claude
    const feedback = formatFeedback(filePath, fileIssues, checkResult.fixes || []);

    return {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: feedback
      }
    };

  } catch (err) {
    // buoy check failed or not installed - silent failure
    return null;
  }
}

/**
 * Format drift issues as actionable feedback for Claude
 */
function formatFeedback(filePath, issues, fixes) {
  const lines = [
    `⚠️ Design drift detected in ${path.basename(filePath)}:`,
    ''
  ];

  for (const issue of issues.slice(0, 5)) { // Limit to 5 issues
    const location = issue.line ? `:${issue.line}` : '';
    lines.push(`• ${issue.type}: ${issue.message}`);

    // Find matching fix suggestion
    const fix = fixes.find(f =>
      f.file === issue.file && f.line === issue.line
    );

    if (fix && fix.suggestion) {
      lines.push(`  Fix: ${fix.suggestion}`);
      if (fix.replacement) {
        lines.push(`  Replace: \`${fix.old}\` → \`${fix.new}\``);
      }
    }
    lines.push('');
  }

  if (issues.length > 5) {
    lines.push(`... and ${issues.length - 5} more issues`);
    lines.push('');
  }

  lines.push('Run `buoy show drift` for full details.');

  return lines.join('\n');
}
