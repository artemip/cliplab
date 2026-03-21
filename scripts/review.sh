#!/bin/bash
#
# review.sh — Run all 4 agent reviewers against the current branch
#
# Usage:
#   ./scripts/review.sh              # Review diff vs main
#   ./scripts/review.sh --fixup      # Review + auto-fix until 9+/10
#
# Runs locally. Also invoked by GitHub Actions on PRs.
#

set -euo pipefail

unset CLAUDECODE 2>/dev/null || true

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

MAX_FIXUP_ROUNDS=3
FIXUP_MODE=false

if [[ "${1:-}" == "--fixup" ]]; then
  FIXUP_MODE=true
  shift
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
AMBER='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[review]${NC} $1"; }
pass() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${AMBER}[!]${NC} $1"; }
fail() { echo -e "${RED}[✗]${NC} $1"; }

# ---------------------------------------------------------------------------
# Gather context
# ---------------------------------------------------------------------------

DIFF=$(git diff origin/main...HEAD --stat 2>/dev/null || git diff HEAD~1 --stat)
CHANGED_FILES=$(git diff origin/main...HEAD --name-only 2>/dev/null || git diff HEAD~1 --name-only)

if [ -z "$CHANGED_FILES" ]; then
  log "No changes to review."
  exit 0
fi

log "Reviewing $(echo "$CHANGED_FILES" | wc -l | tr -d ' ') changed files..."

# ---------------------------------------------------------------------------
# Build review prompt
# ---------------------------------------------------------------------------

build_prompt() {
  local agent_name="$1"
  local extra_instructions="$2"

  cat <<PROMPT
You are reviewing a PR for ClipLab — an audio recording and filtering web app.

## Changed Files
$CHANGED_FILES

## Diff Summary
$DIFF

## Instructions
1. Read CLAUDE.md for project conventions
2. Read the changed files listed above
3. Apply your review checklist
4. Rate the changes X/10
5. If rating is 9+, output: <promise>PASS</promise>
6. If rating is below 9, output specific issues then: <promise>NEEDS_WORK</promise>

$extra_instructions

Be specific. Cite file paths and line numbers. Be concise.
PROMPT
}

# ---------------------------------------------------------------------------
# Run a single agent review
# ---------------------------------------------------------------------------

run_review() {
  local agent_name="$1"
  local extra="$2"
  local output_file="$REPO_ROOT/.review-${agent_name}.txt"

  local prompt
  prompt=$(build_prompt "$agent_name" "$extra")

  log "Running ${agent_name} review..."

  claude --agent "$agent_name" \
    -p "$prompt" \
    --output-format text \
    --dangerously-skip-permissions \
    2>/dev/null > "$output_file" || true

  # Extract rating
  local rating
  rating=$(grep -oP '\b(\d+(\.\d+)?)\s*/\s*10' "$output_file" | head -1 || echo "?/10")

  # Check for pass/fail signal
  if grep -q '<promise>PASS</promise>' "$output_file"; then
    pass "${agent_name}: ${rating} — PASS"
    return 0
  else
    warn "${agent_name}: ${rating} — NEEDS WORK"
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Run fixup agent
# ---------------------------------------------------------------------------

run_fixup() {
  local feedback=""

  for agent in arena-reviewer user-reviewer design-reviewer code-simplifier; do
    local review_file="$REPO_ROOT/.review-${agent}.txt"
    if [ -f "$review_file" ] && grep -q '<promise>NEEDS_WORK</promise>' "$review_file"; then
      feedback+="
## ${agent} feedback:
$(cat "$review_file")
"
    fi
  done

  if [ -z "$feedback" ]; then
    log "No actionable feedback to fix."
    return 0
  fi

  log "Running fixup agent..."

  claude -p "You are fixing issues found by PR reviewers for ClipLab.

## Reviewer Feedback
${feedback}

## Instructions
1. Read CLAUDE.md for project conventions
2. Read each reviewer's feedback
3. Make targeted fixes — don't rewrite files
4. Only fix issues that are clearly actionable
5. Run: pnpm lint && pnpm typecheck
6. Commit fixes with message: fix: address review feedback
7. Output <promise>COMPLETE</promise> when done, or <promise>BLOCKED</promise> if stuck

Do NOT over-fix. If a reviewer asks for something out of scope (auth, S3, deployment), skip it.
" \
    --output-format text \
    --dangerously-skip-permissions \
    2>/dev/null || true
}

# ---------------------------------------------------------------------------
# Main review loop
# ---------------------------------------------------------------------------

run_all_reviews() {
  local all_pass=true

  # Run all 4 agents in parallel (background jobs)
  local pids=()

  run_review "arena-reviewer" "Focus on: architecture, abstractions, end-to-end coherence, decision quality." &
  pids+=($!)

  run_review "user-reviewer" "Focus on: UX flow, discoverability, friction, taste, delight." &
  pids+=($!)

  run_review "design-reviewer" "Focus on: token compliance, interaction states, accessibility, responsive behavior." &
  pids+=($!)

  run_review "code-simplifier" "Focus on: unnecessary complexity, duplication, dead code, missed shared utilities." &
  pids+=($!)

  # Wait for all and collect results
  for pid in "${pids[@]}"; do
    if ! wait "$pid"; then
      all_pass=false
    fi
  done

  if $all_pass; then
    pass "All agents rated 9+/10. Ship it."
    return 0
  else
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if $FIXUP_MODE; then
  for round in $(seq 1 "$MAX_FIXUP_ROUNDS"); do
    log "Review round ${round}/${MAX_FIXUP_ROUNDS}"

    if run_all_reviews; then
      pass "All reviews pass after round ${round}."
      exit 0
    fi

    if [ "$round" -lt "$MAX_FIXUP_ROUNDS" ]; then
      run_fixup
    fi
  done

  fail "Reviews did not converge after ${MAX_FIXUP_ROUNDS} rounds."
  log "Check .review-*.txt files for remaining feedback."
  exit 1
else
  if run_all_reviews; then
    exit 0
  else
    log "Run with --fixup to auto-fix: ./scripts/review.sh --fixup"
    exit 1
  fi
fi
