#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/config.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/cli.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/report.sh"

# ---- Prerequisite checks ----
for prereq in python3 java; do
  if ! command -v "$prereq" >/dev/null 2>&1; then
    echo "ERROR: Required command '$prereq' not found in PATH." >&2
    exit 1
  fi
done

MODE="verify"
NO_BUILD=0
SKIP_HELP=0
CASE_FILTER=""
MAX_JOBS="${QA_MAX_JOBS:-4}"
LOCK_DIR="$PROJECT_DIR/qa/.verify.lock"
LOCK_PID_FILE="$LOCK_DIR/pid"
LOCK_CASE_FILE="$LOCK_DIR/case"
LOCK_STARTED_FILE="$LOCK_DIR/started_at"
LOCK_CMD_FILE="$LOCK_DIR/cmd"

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
    --skip-help)
      SKIP_HELP=1
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
  java -cp "$QA_JAR" org.tron.qa.QARunner list \
    | sed -n 's/^  \([^ ]*\).*/\1/p'
}

load_manifest_commands() {
  awk -F'|' 'NF >= 4 && $1 !~ /^#/ { print $1 }' "$MANIFEST_FILE"
}

load_contract_labels() {
  awk -F'|' 'NF >= 6 && $1 !~ /^#/ { print $1 }' "$CONTRACTS_FILE"
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
  local help_tasks regular_tasks stateful_tasks contract_tasks
  help_tasks="$RUNTIME_DIR/help.tasks"
  regular_tasks="$RUNTIME_DIR/regular.tasks"
  stateful_tasks="$RUNTIME_DIR/stateful.tasks"
  contract_tasks="$RUNTIME_DIR/contract.tasks"
  : > "$help_tasks"
  : > "$regular_tasks"
  : > "$stateful_tasks"
  : > "$contract_tasks"

  if [ -n "$CASE_FILTER" ]; then
    if grep -qx "$CASE_FILTER" "$RUNTIME_DIR/registered.txt"; then
      if [ "$SKIP_HELP" -ne 1 ]; then
        enqueue_task help "$CASE_FILTER" >> "$help_tasks"
      fi
      case "$(qa_case_type "$CASE_FILTER")" in
        stateful-*)
          enqueue_task smoke "$CASE_FILTER" >> "$stateful_tasks"
          ;;
        *)
          enqueue_task smoke "$CASE_FILTER" >> "$regular_tasks"
          ;;
      esac
      return 0
    fi
    if load_contract_labels | grep -qx "$CASE_FILTER"; then
      enqueue_task contract "$CASE_FILTER" >> "$contract_tasks"
      return 0
    fi
    echo "Unknown case: $CASE_FILTER"
    exit 1
  fi

  # Use manifest order (not alphabetical registered.txt) so serial stateful
  # cases run in dependency order (e.g. deploy-contract before clear-contract-abi).
  while IFS= read -r command; do
    if [ "$SKIP_HELP" -ne 1 ]; then
      enqueue_task help "$command" >> "$help_tasks"
    fi
    case "$(qa_case_type "$command")" in
      stateful-*)
        enqueue_task smoke "$command" >> "$stateful_tasks"
        ;;
      *)
        enqueue_task smoke "$command" >> "$regular_tasks"
        ;;
    esac
  done < <(load_manifest_commands)

  while IFS= read -r contract_case; do
    enqueue_task contract "$contract_case" >> "$contract_tasks"
  done < <(load_contract_labels)
}

task_count() {
  local task_file="$1"
  [ -f "$task_file" ] || { echo 0; return; }
  wc -l < "$task_file" | tr -d ' '
}

lock_case_label() {
  if [ -n "$CASE_FILTER" ]; then
    printf '%s' "$CASE_FILTER"
  else
    printf '%s' "<all>"
  fi
}

lock_cmdline() {
  local cmd="$0 $MODE"
  if [ -n "$CASE_FILTER" ]; then
    cmd="$cmd --case $CASE_FILTER"
  fi
  if [ "$NO_BUILD" -eq 1 ]; then
    cmd="$cmd --no-build"
  fi
  if [ "$SKIP_HELP" -eq 1 ]; then
    cmd="$cmd --skip-help"
  fi
  printf '%s' "$cmd"
}

write_lock_metadata() {
  printf '%s\n' "$$" > "$LOCK_PID_FILE"
  printf '%s\n' "$(lock_case_label)" > "$LOCK_CASE_FILE"
  date '+%Y-%m-%d %H:%M:%S %z' > "$LOCK_STARTED_FILE"
  lock_cmdline > "$LOCK_CMD_FILE"
}

print_existing_lock_info() {
  local pid case_label started_at cmd
  pid="$(cat "$LOCK_PID_FILE" 2>/dev/null || true)"
  case_label="$(cat "$LOCK_CASE_FILE" 2>/dev/null || true)"
  started_at="$(cat "$LOCK_STARTED_FILE" 2>/dev/null || true)"
  cmd="$(cat "$LOCK_CMD_FILE" 2>/dev/null || true)"

  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo "Another qa/run.sh verify is already in progress."
    echo "  pid: $pid"
    [ -n "$case_label" ] && echo "  case: $case_label"
    [ -n "$started_at" ] && echo "  started: $started_at"
    [ -n "$cmd" ] && echo "  command: $cmd"
    echo "  lock: $LOCK_DIR"
    return 0
  fi

  echo "Found a stale qa verify lock."
  [ -n "$pid" ] && echo "  stale pid: $pid"
  [ -n "$case_label" ] && echo "  case: $case_label"
  [ -n "$started_at" ] && echo "  started: $started_at"
  [ -n "$cmd" ] && echo "  command: $cmd"
  echo "  lock: $LOCK_DIR"
  echo "Remove it with: rm -rf $LOCK_DIR"
  return 0
}

if [ "$MODE" = "list" ]; then
  if [ ! -f "$QA_JAR" ]; then
    echo "wallet-cli-qa.jar not found: $QA_JAR (build with: ./gradlew qaJar)"
    exit 1
  fi
  java -cp "$QA_JAR" org.tron.qa.QARunner list
  exit 0
fi

if [ "$MODE" != "verify" ]; then
  echo "Unknown mode: $MODE"
  echo "Usage: $0 <verify|list> [--case X] [--no-build] [--skip-help]"
  exit 1
fi

echo "=== Standard CLI Contract Verification — Network: $NETWORK${CASE_FILTER:+, Case: $CASE_FILTER} ==="
echo

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  print_existing_lock_info
  exit 1
fi
trap 'rm -rf "$LOCK_DIR"' EXIT
write_lock_metadata

if [ "$NO_BUILD" -eq 1 ]; then
  [ -f "$WALLET_JAR" ] || { echo "Cannot skip build: $WALLET_JAR does not exist"; exit 1; }
  [ -f "$QA_JAR" ] || { echo "Cannot skip build: $QA_JAR does not exist (build with: ./gradlew qaJar)"; exit 1; }
  echo "Skipping build (--no-build)."
elif build_required; then
  echo "Building wallet-cli..."
  ./gradlew shadowJar qaJar -q
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

if [ "$SKIP_HELP" -eq 1 ]; then
  echo "Help cases: $(task_count "$RUNTIME_DIR/help.tasks") (skipped)"
else
  echo "Help cases: $(task_count "$RUNTIME_DIR/help.tasks")"
fi
echo "Parallel main cases: $(task_count "$RUNTIME_DIR/regular.tasks")"
echo "Serial stateful cases: $(task_count "$RUNTIME_DIR/stateful.tasks")"
echo "Contract cases: $(task_count "$RUNTIME_DIR/contract.tasks")"
echo

if [ "$SKIP_HELP" -eq 1 ]; then
  echo "Skipping help cases (--skip-help)..."
else
  echo "Running help cases..."
  run_task_file_parallel "$RUNTIME_DIR/help.tasks" "$MAX_JOBS"
fi
echo "Running parallel main cases..."
run_task_file_parallel "$RUNTIME_DIR/regular.tasks" "$MAX_JOBS"
echo "Running serial stateful cases..."
run_task_file_serial "$RUNTIME_DIR/stateful.tasks"
echo "Running contract cases..."
run_task_file_parallel "$RUNTIME_DIR/contract.tasks" "$MAX_JOBS"
echo "Generating report..."

registered_count="$(wc -l < "$RUNTIME_DIR/registered.txt" | tr -d ' ')"
covered_count="$(manifest_count)"
excluded_count="$(manifest_excluded_count)"
missing_count="$(wc -l < "$RUNTIME_DIR/missing.txt" | tr -d ' ')"
stale_count="$(wc -l < "$RUNTIME_DIR/stale.txt" | tr -d ' ')"
contract_count="$(load_contract_labels | wc -l | tr -d ' ')"

qa_generate_report "$registered_count" "$covered_count" "$excluded_count" "$missing_count" "$stale_count" "$contract_count"
cat "$REPORT_FILE"

grep -q "Overall Compliance: PASS" "$REPORT_FILE"
