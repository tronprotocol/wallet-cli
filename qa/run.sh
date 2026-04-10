#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/config.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/cli.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/report.sh"

MODE="verify"
NO_BUILD=0
CASE_FILTER=""
MAX_JOBS="${QA_MAX_JOBS:-4}"
LOCK_DIR="$PROJECT_DIR/qa/.verify.lock"

if [ $# -gt 0 ] && [[ "$1" != --* ]]; then
  MODE="$1"
  shift
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --case)
      CASE_FILTER="$2"
      shift 2
      ;;
    --no-build)
      NO_BUILD=1
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

build_required() {
  if [ ! -f "$WALLET_JAR" ]; then
    return 0
  fi
  find src/main/java src/main/gen src/main/protos -type f -newer "$WALLET_JAR" -print -quit 2>/dev/null | grep -q . && return 0
  for f in build.gradle settings.gradle; do
    [ -f "$f" ] && [ "$f" -nt "$WALLET_JAR" ] && return 0
  done
  return 1
}

load_registered_commands() {
  java -cp "$WALLET_JAR" org.tron.qa.QARunner list \
    | sed -n 's/^  \([^ ]*\).*/\1/p'
}

load_manifest_commands() {
  awk -F'|' 'NF >= 4 && $1 !~ /^#/ { print $1 }' "$MANIFEST_FILE"
}

manifest_count() {
  load_manifest_commands | wc -l | tr -d ' '
}

manifest_excluded_count() {
  awk -F'|' '$2 == "excluded-interactive" { count++ } END { print count + 0 }' "$MANIFEST_FILE"
}

audit_manifest() {
  local registered_file manifest_file missing_file stale_file duplicates_file
  registered_file="$RUNTIME_DIR/registered.txt"
  manifest_file="$RUNTIME_DIR/manifest.txt"
  missing_file="$RUNTIME_DIR/missing.txt"
  stale_file="$RUNTIME_DIR/stale.txt"
  duplicates_file="$RUNTIME_DIR/duplicates.txt"

  load_registered_commands | sort > "$registered_file"
  load_manifest_commands | sort > "$manifest_file"
  awk -F'|' 'NF >= 4 && $1 !~ /^#/ { count[$1]++ } END { for (cmd in count) if (count[cmd] > 1) print cmd }' \
    "$MANIFEST_FILE" | sort > "$duplicates_file"
  comm -23 "$registered_file" "$manifest_file" > "$missing_file"
  comm -13 "$registered_file" "$manifest_file" > "$stale_file"

  if [ -s "$duplicates_file" ] || [ -s "$missing_file" ] || [ -s "$stale_file" ]; then
    echo "Manifest audit failed."
    [ -s "$duplicates_file" ] && { echo "Duplicate manifest entries:"; cat "$duplicates_file"; }
    [ -s "$missing_file" ] && { echo "Missing manifest entries:"; cat "$missing_file"; }
    [ -s "$stale_file" ] && { echo "Stale manifest entries:"; cat "$stale_file"; }
    exit 1
  fi
}

enqueue_task() {
  printf '%s|%s\n' "$1" "$2"
}

run_task_file_parallel() {
  local task_file="$1"
  local jobs="$2"
  [ -s "$task_file" ] || return 0
  xargs -P "$jobs" -n 2 bash "$SCRIPT_DIR/task_runner.sh" < <(tr '|' '\n' < "$task_file")
}

run_task_file_serial() {
  local task_file="$1"
  [ -s "$task_file" ] || return 0
  while IFS='|' read -r kind name; do
    bash "$SCRIPT_DIR/task_runner.sh" "$kind" "$name"
  done < "$task_file"
}

prepare_task_files() {
  local help_tasks regular_tasks stateful_tasks global_tasks
  help_tasks="$RUNTIME_DIR/help.tasks"
  regular_tasks="$RUNTIME_DIR/regular.tasks"
  stateful_tasks="$RUNTIME_DIR/stateful.tasks"
  global_tasks="$RUNTIME_DIR/global.tasks"
  : > "$help_tasks"
  : > "$regular_tasks"
  : > "$stateful_tasks"
  : > "$global_tasks"

  if [ -n "$CASE_FILTER" ]; then
    if grep -qx "$CASE_FILTER" "$RUNTIME_DIR/registered.txt"; then
      enqueue_task help "$CASE_FILTER" >> "$help_tasks"
      case "$(qa_case_type "$CASE_FILTER")" in
        stateful-success)
          enqueue_task main "$CASE_FILTER" >> "$stateful_tasks"
          ;;
        *)
          enqueue_task main "$CASE_FILTER" >> "$regular_tasks"
          ;;
      esac
      return 0
    fi
    enqueue_task global "$CASE_FILTER" >> "$global_tasks"
    return 0
  fi

  while IFS= read -r command; do
    enqueue_task help "$command" >> "$help_tasks"
    case "$(qa_case_type "$command")" in
      stateful-success)
        enqueue_task main "$command" >> "$stateful_tasks"
        ;;
      *)
        enqueue_task main "$command" >> "$regular_tasks"
        ;;
    esac
  done < "$RUNTIME_DIR/registered.txt"

  for global_case in global-help version-flag missing-command unknown-global-option unknown-command; do
    enqueue_task global "$global_case" >> "$global_tasks"
  done
}

task_count() {
  local task_file="$1"
  [ -f "$task_file" ] || { echo 0; return; }
  wc -l < "$task_file" | tr -d ' '
}

if [ "$MODE" = "list" ]; then
  if [ ! -f "$WALLET_JAR" ]; then
    echo "wallet-cli.jar not found: $WALLET_JAR"
    exit 1
  fi
  java -cp "$WALLET_JAR" org.tron.qa.QARunner list
  exit 0
fi

if [ "$MODE" != "verify" ]; then
  echo "Unknown mode: $MODE"
  echo "Usage: $0 <verify|list> [--case X] [--no-build]"
  exit 1
fi

echo "=== Standard CLI Contract Verification — Network: $NETWORK${CASE_FILTER:+, Case: $CASE_FILTER} ==="
echo

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Another qa/run.sh verify is already in progress: $LOCK_DIR"
  exit 1
fi
trap 'rm -rf "$LOCK_DIR"' EXIT

if [ "$NO_BUILD" -eq 1 ]; then
  [ -f "$WALLET_JAR" ] || { echo "Cannot skip build: $WALLET_JAR does not exist"; exit 1; }
  echo "Skipping build (--no-build)."
elif build_required; then
  echo "Building wallet-cli..."
  ./gradlew shadowJar -q
  echo "Build complete."
else
  echo "Build skipped (wallet-cli.jar is up to date)."
fi
echo

qa_clean_runtime
echo "Auditing manifest coverage..."
audit_manifest
echo "Preparing workspace templates..."
qa_prepare_templates
echo "Seeding shared runtime data..."
qa_prepare_seeds
echo "Building task queues..."
prepare_task_files

echo "Help cases: $(task_count "$RUNTIME_DIR/help.tasks")"
echo "Global cases: $(task_count "$RUNTIME_DIR/global.tasks")"
echo "Parallel main cases: $(task_count "$RUNTIME_DIR/regular.tasks")"
echo "Serial stateful cases: $(task_count "$RUNTIME_DIR/stateful.tasks")"
echo

echo "Running help cases..."
run_task_file_parallel "$RUNTIME_DIR/help.tasks" "$MAX_JOBS"
echo "Running global cases..."
run_task_file_parallel "$RUNTIME_DIR/global.tasks" "$MAX_JOBS"
echo "Running parallel main cases..."
run_task_file_parallel "$RUNTIME_DIR/regular.tasks" "$MAX_JOBS"
echo "Running serial stateful cases..."
run_task_file_serial "$RUNTIME_DIR/stateful.tasks"
echo "Generating report..."

registered_count="$(wc -l < "$RUNTIME_DIR/registered.txt" | tr -d ' ')"
covered_count="$(manifest_count)"
excluded_count="$(manifest_excluded_count)"
missing_count="$(wc -l < "$RUNTIME_DIR/missing.txt" | tr -d ' ')"
stale_count="$(wc -l < "$RUNTIME_DIR/stale.txt" | tr -d ' ')"

qa_generate_report "$registered_count" "$covered_count" "$excluded_count" "$missing_count" "$stale_count"
cat "$REPORT_FILE"
