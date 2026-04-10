#!/usr/bin/env python3
import json
import os
import shlex
import sys


def read_table(path):
    rows = []
    if not os.path.exists(path):
        return rows
    with open(path, "r", encoding="utf-8") as fh:
        for raw_line in fh:
            line = raw_line.rstrip("\n")
            if not line or line.lstrip().startswith("#"):
                continue
            rows.append(line.split("|"))
    return rows


def find_row(rows, label):
    for row in rows:
        if row and row[0] == label:
            return row
    return None


def load_seeds(path):
    result = {}
    if not path or not os.path.exists(path):
        return result
    with open(path, "r", encoding="utf-8") as fh:
        for raw_line in fh:
            line = raw_line.strip()
            if not line or "=" not in line:
                continue
            key, value = line.split("=", 1)
            try:
                tokens = shlex.split(value)
                result[key] = tokens[0] if tokens else ""
            except Exception:
                result[key] = value
    return result


def substitute_token(token, values):
    updated = token
    for key, value in values.items():
        updated = updated.replace("{{%s}}" % key, value)
    return updated


def unresolved_tokens(tokens):
    missing = []
    for token in tokens:
        start = 0
        while True:
            open_idx = token.find("{{", start)
            if open_idx < 0:
                break
            close_idx = token.find("}}", open_idx + 2)
            if close_idx < 0:
                break
            missing.append(token[open_idx:close_idx + 2])
            start = close_idx + 2
    return missing


def split_csv(value):
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def smoke_expectation(case_type):
    mapping = {
        "offline-success": "success",
        "noauth-success": "success",
        "auth-success": "success",
        "stateful-success": "success",
        "expected-usage-error": "usage",
        "expected-execution-error": "execution",
        "excluded-interactive": "skip",
    }
    return mapping.get(case_type, "invalid")


def build_smoke_case(label, row, values):
    case_type = row[1] if len(row) > 1 else ""
    template = row[2] if len(row) > 2 else "empty"
    requires = row[3] if len(row) > 3 else "none"
    args_string = row[4] if len(row) > 4 else ""
    json_path_exists = split_csv(row[5] if len(row) > 5 else "")
    json_path_absent = split_csv(row[6] if len(row) > 6 else "")
    error_code = row[7] if len(row) > 7 else ""
    text_contains = split_csv(row[8] if len(row) > 8 else "")
    preflight = split_csv(row[9] if len(row) > 9 else "")

    raw_tokens = shlex.split(args_string) if args_string else []
    resolved_tokens = [substitute_token(token, values) for token in raw_tokens]
    unresolved = unresolved_tokens(resolved_tokens)

    command_tokens = [label] + resolved_tokens
    return {
        "label": label,
        "suite": "stateful" if case_type == "stateful-success" else "smoke",
        "template": template or "empty",
        "requires": requires or "none",
        "env_mode": "default",
        "expectation": smoke_expectation(case_type),
        "text_argv": ["--network", values["NETWORK"]] + command_tokens,
        "json_argv": ["--output", "json", "--network", values["NETWORK"]] + command_tokens,
        "json_path_exists": json_path_exists,
        "json_path_absent": json_path_absent,
        "error_code": error_code,
        "text_contains": text_contains,
        "text_absent": ["Error:", "Usage:"] if smoke_expectation(case_type) == "success" else [],
        "preflight": preflight,
        "unresolved_placeholders": unresolved,
        "excluded": case_type == "excluded-interactive",
    }


def build_help_case(label, values):
    return {
        "label": "help__%s" % label,
        "suite": "help",
        "template": "empty",
        "requires": "none",
        "env_mode": "default",
        "expectation": "help_dual",
        "text_argv": ["--network", values["NETWORK"], label, "--help"],
        "json_argv": ["--output", "json", "--network", values["NETWORK"], label, "--help"],
        "json_path_exists": ["data.help"],
        "json_path_absent": [],
        "error_code": "",
        "text_contains": ["Usage:", "wallet-cli %s" % label],
        "text_absent": ["Error:"],
        "preflight": [],
        "unresolved_placeholders": [],
        "excluded": False,
    }


def build_contract_case(label, row, values):
    template = row[1] if len(row) > 1 else "empty"
    requires = row[2] if len(row) > 2 else "none"
    env_mode = row[3] if len(row) > 3 else "default"
    stream_mode = row[4] if len(row) > 4 else "text"
    expectation = row[5] if len(row) > 5 else "success"
    args_json = row[6] if len(row) > 6 else "[]"
    json_path_exists = split_csv(row[7] if len(row) > 7 else "")
    json_path_absent = split_csv(row[8] if len(row) > 8 else "")
    error_code = row[9] if len(row) > 9 else ""
    text_contains = split_csv(row[10] if len(row) > 10 else "")
    text_absent = split_csv(row[11] if len(row) > 11 else "")
    preflight = split_csv(row[12] if len(row) > 12 else "")

    raw_tokens = json.loads(args_json)
    if not isinstance(raw_tokens, list) or not all(isinstance(item, str) for item in raw_tokens):
        raise SystemExit("Contract args_json must be an array of strings: %s" % label)
    resolved_tokens = [substitute_token(token, values) for token in raw_tokens]
    unresolved = unresolved_tokens(resolved_tokens)

    text_argv = None
    json_argv = None
    if stream_mode in ("text", "dual"):
      text_argv = resolved_tokens
    if stream_mode in ("json", "dual"):
      if stream_mode == "dual" and "--output" not in resolved_tokens and not any(
          token.startswith("--output=") for token in resolved_tokens):
          json_argv = ["--output", "json"] + resolved_tokens
      else:
          json_argv = list(resolved_tokens)

    return {
        "label": label,
        "suite": "contract",
        "template": template or "empty",
        "requires": requires or "none",
        "env_mode": env_mode or "default",
        "expectation": expectation,
        "text_argv": text_argv,
        "json_argv": json_argv,
        "json_path_exists": json_path_exists,
        "json_path_absent": json_path_absent,
        "error_code": error_code,
        "text_contains": text_contains,
        "text_absent": text_absent,
        "preflight": preflight,
        "unresolved_placeholders": unresolved,
        "excluded": False,
    }


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: case_resolver.py <help|smoke|contract> <label>")

    kind, label = sys.argv[1], sys.argv[2]
    seed_values = load_seeds(os.environ.get("QA_SEED_FILE", ""))
    values = {
        "NETWORK": os.environ.get("NETWORK", ""),
        "MY_ADDR": os.environ.get("MY_ADDR", ""),
        "TARGET_ADDR": os.environ.get("TARGET_ADDR", ""),
        "USDT_NILE": os.environ.get("USDT_NILE", ""),
        "FAKE_ID_64": os.environ.get("FAKE_ID_64", ""),
        "PRIVATE_KEY": os.environ.get("PRIVATE_KEY", ""),
        "MNEMONIC": os.environ.get("MNEMONIC", ""),
        "MASTER_PASSWORD": os.environ.get("MASTER_PASSWORD", ""),
        "ALT_PASSWORD": os.environ.get("ALT_PASSWORD", ""),
    }
    values.update(seed_values)

    if kind == "help":
        resolved = build_help_case(label, values)
    elif kind == "smoke":
        row = find_row(read_table(os.environ["MANIFEST_FILE"]), label)
        if row is None:
            raise SystemExit("Manifest case not found: %s" % label)
        resolved = build_smoke_case(label, row, values)
    elif kind == "contract":
        row = find_row(read_table(os.environ["CONTRACTS_FILE"]), label)
        if row is None:
            raise SystemExit("Contract case not found: %s" % label)
        resolved = build_contract_case(label, row, values)
    else:
        raise SystemExit("Unknown case kind: %s" % kind)

    print(json.dumps(resolved))


if __name__ == "__main__":
    main()
