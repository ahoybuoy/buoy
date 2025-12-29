# Manual Testing for @buoy/plugin-github

## Prerequisites

1. A GitHub repo with an open PR
2. A GitHub token with `repo` scope
3. The plugin installed

## Test Commands

### Test 1: Direct Plugin Test

```bash
# Set environment
export GITHUB_TOKEN="your-token"
export GITHUB_REPOSITORY="owner/repo"
export GITHUB_PR_NUMBER="123"

# Run CI with GitHub reporting
cd your-project
buoy ci --github-token $GITHUB_TOKEN --github-repo $GITHUB_REPOSITORY --github-pr $GITHUB_PR_NUMBER
```

### Test 2: Using Environment Variables

```bash
# GitHub Actions sets these automatically
export GITHUB_TOKEN="${{ secrets.GITHUB_TOKEN }}"
export GITHUB_REPOSITORY="${{ github.repository }}"
export GITHUB_PR_NUMBER="${{ github.event.pull_request.number }}"

buoy ci
```

### Expected Results

1. PR comment should appear with Buoy drift report
2. Running again should update the same comment (not create new)
3. No drift = green success message
4. Drift found = table of issues by severity
