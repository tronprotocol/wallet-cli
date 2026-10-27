#!/usr/bin/env node
// Read-only worktree prune audit. Classifies every git worktree by size, merge
// state, uncommitted work, ignored files outside build and cache directories,
// commits only its HEAD reflog reaches, remote/PR state, and the most recent chat that
// operated in it, then prints a table sorted by size with a suggested bucket.
// Never deletes anything; deletion stays a human-gated step in the playbook.
//
//   node worktree-audit.mjs [repo-path] [transcripts-path ...]
//
// Without a transcripts path it scans every runtime's transcripts directory
// that exists: Claude Code's projects under $CLAUDE_CONFIG_DIR, Codex's sessions
// and archived_sessions under $CODEX_HOME, and Pi's sessions and pstack subagent
// sessions under $PI_CODING_AGENT_DIR (defaults: ~/.claude, ~/.codex, ~/.pi/agent).
//
// Every probe yields a Fact, { known: true, value } or { known: false }. A hold
// bucket needs only its own fact; `safe` needs every fact known.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { candidates, rethrowUnlessRemoved } from "../../reflect/scripts/find-transcript.mjs";

const known = (value) => ({ known: true, value });
const UNKNOWN = Object.freeze({ known: false });
const probe = (read) => {
  try {
    return known(read());
  } catch {
    return UNKNOWN;
  }
};
const bind = (fact, next) => (fact.known ? next(fact.value) : UNKNOWN);

const DAY = 86400;
const RECENT_DAYS = 4;
const HEADER = ["SIZE", "AGE", "MERGED", "DIRTY", "REMOTE", "PR", "LAST_CHAT", "BUCKET", "LOCKED", "WORKTREE"];
// Merged and closed PRs drop out of gh's default open-only listing.
const GH_PR_LIST = ["pr", "list", "--author", "@me", "--state", "all", "--limit", "1000",
  "--json", "number,state,headRefName,headRefOid"];
// An ignored path under one of these names is a rebuildable build or cache
// artifact. Any other ignored path, such as `.env`, may exist nowhere else.
export const DISPOSABLE = new Set([
  ".build", ".cache", ".dart_tool", ".DS_Store", ".gradle", ".lake", ".lycheecache", ".mypy_cache", ".next", ".nuxt",
  ".parcel-cache", ".pytest_cache", ".ruff_cache", ".svelte-kit", ".tox", ".turbo", ".venv", "__pycache__", "build",
  "coverage", "DerivedData", "dist", "node_modules", "target", "venv",
]);

export function classify(facts) {
  const { locked, dirty, orphans, pr, recent, ancestry, head } = facts;
  if (locked.known && locked.value !== null) return "hold-locked";
  if (dirty.known && dirty.value.wip > 0) return "hold-wip";
  if (dirty.known && dirty.value.untracked > 0) return "hold-untracked";
  if (orphans.known && orphans.value > 0) return "hold-reflog";
  if (dirty.known && dirty.value.ignored > 0) return "hold-ignored";
  if (pr.known && pr.value?.state === "OPEN") return "hold-open-pr";
  if (recent.known && recent.value) return "verify-recent-chat";
  if (Object.values(facts).some((fact) => !fact.known)) return "review";
  if (ancestry.value) return "safe";
  if (pr.value?.state === "MERGED" && pr.value.headRefOid === head.value) return "safe";
  return "review";
}

// The default 1 MiB buffer fails a status that lists several thousand untracked files.
function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: Infinity })
    .replace(/\n+$/, "");
}

const runGh = (args, cwd) =>
  execFileSync("gh", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// `--porcelain -z` output: NUL-separated fields, one record per worktree, the
// primary worktree first.
export function parseWorktrees(output) {
  const worktrees = [];
  for (const field of output.split("\0")) {
    if (field.startsWith("worktree ")) worktrees.push({ path: field.slice("worktree ".length), prunable: false, locked: null });
    else if (field.startsWith("prunable")) worktrees.at(-1).prunable = true;
    else if (field.startsWith("locked")) worktrees.at(-1).locked = field.slice("locked ".length);
  }
  return worktrees;
}

export function defaultTranscriptRoots({ env = process.env, home = homedir(), stat = statSync } = {}) {
  const claude = join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "projects");
  const codex = env.CODEX_HOME || join(home, ".codex");
  const piAgent = env.PI_CODING_AGENT_DIR || join(home, ".pi", "agent");
  const copilot = join(env.COPILOT_HOME || join(home, ".copilot"), "session-state");
  const found = [claude, join(codex, "sessions"), join(codex, "archived_sessions"),
    join(piAgent, "sessions"), join(piAgent, "pstack"), copilot].filter((root) => {
      try {
        return stat(root, { throwIfNoEntry: false }) !== undefined;
      } catch (error) {
        return !["ENOENT", "ENOTDIR"].includes(error.code);
      }
    });
  return found.length ? found : [claude];
}

// APFS inode numbers pass 2^53, where two of them read as one number.
const fileId = (path, stat) => {
  const { dev, ino } = stat(path, { bigint: true });
  return `${dev}:${ino}`;
};

// A link is known by the identity stat reports for what it lands on, and by
// the name realpathSync gives it when it gives one. The name alone misses
// links: node resolves `..` in a target before the links in it and keeps a
// firmlink route as written, and bun opens the target to name it, which macOS
// refuses for its autofs /home. A dangling or looping link (ENOENT, ELOOP)
// spells nothing. When stat fails any other way the route is closed to this
// process and the link could land anywhere, so the error propagates and the
// caller leaves the worktree's chat fact unknown.
export function symlinkTargets(dir, stat = statSync) {
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isSymbolicLink()).flatMap((entry) => {
    const link = join(dir, entry.name);
    try {
      return [[link, { id: fileId(link, stat), name: probe(() => realpathSync(link)).value }]];
    } catch (error) {
      if (["ENOENT", "ELOOP"].includes(error.code)) return [];
      throw error;
    }
  });
}

// Git reports a worktree by its resolved path, while a session may name it
// through a symlink in an ancestor directory, as macOS spells /private/tmp/x
// as /tmp/x, or through several, as /tmp/link/x when /private/tmp/link points
// at /private/tmp/real. A worktree whose directory is gone keeps git's spelling.
export function pathSpellings(path, linksIn = symlinkTargets, stat = statSync) {
  let resolved;
  try {
    resolved = realpathSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return [path];
    throw error;
  }
  const ancestors = [];
  for (let dir = dirname(resolved); ; dir = dirname(dir)) {
    ancestors.unshift(dir);
    if (dir === dirname(dir)) break;
  }
  const onPath = [...ancestors, resolved];
  // A link lands on every directory that it names or that shares its identity:
  // a filesystem may report one identity for several, and a spare spelling
  // costs a hold where a missed one can cost the worktree.
  const links = ancestors.flatMap((dir) => linksIn(dir).flatMap(([link, { id, name }]) =>
    onPath.filter((target) => target === name || fileId(target, stat) === id).map((target) => [dir, link, target])));
  // Spell each directory from the root down, so a link's own directory is
  // already spelled when the link is applied. A link back up to an ancestor of
  // its directory is applied through that directory's resolved spelling only,
  // which keeps the set finite.
  const spelled = new Map();
  for (const dir of onPath) {
    const parent = dirname(dir);
    const forms = new Set(parent === dir ? [dir] : spelled.get(parent).map((form) => join(form, basename(dir))));
    for (const [home, link, target] of links) {
      if (target === dir) for (const form of spelled.get(home) ?? [home]) forms.add(join(form, basename(link)));
    }
    spelled.set(dir, [...forms]);
  }
  return [...new Set([path, ...spelled.get(resolved)])];
}

// A transcript names a worktree up to a boundary byte or the end of the JSON
// string, never a bare prefix, so `/x/candidate` does not inherit a chat that
// ran in `/x/candidate-long`. Only JSONL is scanned, so the path appears
// JSON-escaped and a `\` after it opens the escape of a quote, backslash, or
// control byte. `.` counts only before another boundary (a sentence-final
// path), because `/x/candidate.bak` is a plausible sibling. `*`, `$`, and `{`
// stay out: they extend a path by glob or expansion. `?` globs too, but it
// also ends a question or a URL's path, and a false match costs only a hold.
const BOUNDARY = new Set(Buffer.from("/\\\"' `:;),|&<>]}?!"));
const DOT = ".".charCodeAt(0);
const bounded = (text, at) => at === text.length || BOUNDARY.has(text[at]);
function mentions(text, needle) {
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    const end = at + needle.length;
    if (bounded(text, end) || (text[end] === DOT && bounded(text, end + 1))) return true;
  }
  return false;
}

// Git on Windows may spell a path with forward slashes while the session uses backslashes.
function transcriptNeedles(spellings) {
  const forms = spellings.flatMap((spelling) => (/^(?:[a-z]:[\\/]|\\\\|\/\/)/i.test(spelling)
    ? [spelling.replaceAll("\\", "/"), spelling.replaceAll("/", "\\")]
    : [spelling]));
  return [...new Set(forms)].map((form) => Buffer.from(JSON.stringify(form).slice(1, -1)));
}

// `spellings` maps each worktree path to every spelling a session could use.
export function lastChats(roots, spellings) {
  const needles = [...spellings].map(([path, forms]) => [path, transcriptNeedles(forms)]);
  const latest = new Map();
  for (const { path: file } of roots.flatMap((root) => candidates(root, Infinity))) {
    let text, mtime;
    try {
      text = readFileSync(file);
      // A session can resume after enumeration. Its new content must use its
      // current timestamp, not the old one used to order the candidates.
      mtime = Math.floor(statSync(file).mtimeMs / 1000);
    } catch (error) {
      rethrowUnlessRemoved(error);
      continue;
    }
    for (const [path, forms] of needles) {
      if (mtime > (latest.get(path) ?? 0) && forms.some((needle) => mentions(text, needle))) latest.set(path, mtime);
    }
  }
  return latest;
}

// The trunk is whatever the remote says it is; main only when it publishes no
// usable HEAD.
function trunkName(repo) {
  const advertised = probe(() => git(repo, "ls-remote", "--symref", "origin", "HEAD"));
  return (advertised.known && /^ref: refs\/heads\/(.+)\tHEAD$/m.exec(advertised.value)?.[1]) || "main";
}

function isAncestor(repo, head, trunk) {
  try {
    git(repo, "merge-base", "--is-ancestor", head, `origin/${trunk}`);
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
}

// `--ignored=matching` prints an ignored directory once, as `!! node_modules/`,
// and an ignored file inside a tracked directory by its own path.
function dirtyState(path) {
  const lines = git(path, "status", "--porcelain", "--untracked-files=all", "--ignored=matching", "--ignore-submodules=none")
    .split("\n").filter(Boolean);
  const untracked = lines.filter((line) => line.startsWith("??")).length;
  const ignoredLines = lines.filter((line) => line.startsWith("!!"));
  const ignored = ignoredLines.filter((line) => {
    const parts = line.slice(3).replace(/^"|"$/g, "").split("/");
    return !parts.some((part) => DISPOSABLE.has(part));
  }).length;
  return { wip: lines.length - untracked - ignoredLines.length, untracked, ignored };
}

// Counts commits that only this worktree's HEAD reflog reaches, which
// `git worktree remove` deletes. A commit a branch reflog also lists, such as
// a rebased branch's old tip, lives in the shared logs and survives removal.
function reflogOnly(path, branchLogged) {
  const visited = new Set(git(path, "rev-list", "--walk-reflogs", "HEAD").split("\n").filter(Boolean));
  const input = [...visited, ...[...branchLogged].map((sha) => `^${sha}`)].join("\n");
  // `--not` before `--stdin` leaves the stdin revisions unnegated.
  return Number(execFileSync("git", ["rev-list", "--count", "--not", "--branches", "--tags", "--remotes", "--stdin"], {
    cwd: path, encoding: "utf8", input: `${input}\n`, stdio: ["pipe", "pipe", "pipe"], maxBuffer: Infinity,
  }).trim());
}

function remoteState(path, branch, head) {
  const sha = git(path, "for-each-ref", "--format=%(objectname)", `refs/remotes/origin/${branch}`);
  if (!sha) return "no-remote";
  if (sha === head) return "pushed";
  return `ahead${git(path, "rev-list", "--count", `origin/${branch}..HEAD`)}`;
}

export function duSize(output) {
  return output.trim().split(/\s/)[0];
}

function size(path) {
  try {
    return duSize(execFileSync("du", ["-sh", path], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch {
    return "?";
  }
}

// Orders du's human-readable sizes the way `sort -h` does.
function sizeKey(label) {
  const match = /^(\d+(?:\.\d+)?)([KMGTPE]?)/.exec(label);
  if (!match) return 0;
  return Number(match[1]) * 1024 ** (match[2] ? "KMGTPE".indexOf(match[2]) + 1 : 0);
}

function dirtyLabel({ wip, untracked, ignored }, orphans) {
  return [
    wip > 0 && `wip:${wip}`,
    untracked > 0 && `untracked:${untracked}`,
    ignored > 0 && `ignored:${ignored}`,
    orphans.known && orphans.value > 0 && `reflog:${orphans.value}`,
  ].filter(Boolean).join(",") || "clean";
}

// `--porcelain -z` hands over the lock reason raw, newlines included.
function lockedLabel(locked) {
  if (locked === null) return "-";
  return locked.replace(/\s+/g, " ").trim() || "locked";
}

function auditWorktree({ path, locked }, { repo, trunk, fetched, prs, chats, branchLogs, now }) {
  const head = probe(() => git(path, "rev-parse", "HEAD"));
  const age = bind(head, () => probe(() => Math.trunc((now - Number(git(path, "log", "-1", "--format=%ct", "HEAD"))) / DAY)));
  const ancestry = bind(head, (sha) => probe(() => isAncestor(repo, sha, trunk)));
  const dirty = probe(() => dirtyState(path));
  const orphans = bind(head, () => bind(branchLogs, (logged) => probe(() => reflogOnly(path, logged))));
  const branch = probe(() => {
    const name = git(path, "rev-parse", "--abbrev-ref", "HEAD");
    return name === "HEAD" ? null : name;
  });
  const remote = bind(branch, (name) => (name === null ? known("detached") : probe(() => remoteState(path, name, head.value))));
  const pr = bind(prs, (list) => bind(branch, (name) => known(list.find((entry) => name !== null && entry.headRefName === name) ?? null)));
  const lastChat = chats.get(path);
  const recent = bind(lastChat, (ts) => known(ts !== null && Math.trunc((now - ts) / DAY) <= RECENT_DAYS));
  const bucket = classify({ trunk: fetched, head, age, ancestry, dirty, orphans, remote, pr, recent, locked: known(locked) });
  return [
    size(path),
    age.known ? `${age.value}d` : "?",
    ancestry.known ? (ancestry.value ? "YES" : "no") : "?",
    dirty.known ? dirtyLabel(dirty.value, orphans) : "unknown",
    remote.known ? remote.value : "unknown",
    pr.known && pr.value ? `#${pr.value.number}/${pr.value.state}` : "-",
    lastChat.known && lastChat.value !== null ? new Date(lastChat.value * 1000).toISOString().slice(0, 10) : "-",
    bucket,
    lockedLabel(locked),
    path,
  ];
}

// Discovery failures keep the table printing, but leave their facts unknown so
// no row they touch can reach `safe`.
export function audit({
  repo,
  transcripts,
  gh = runGh,
  warn = (line) => console.error(line),
  now = Math.floor(Date.now() / 1000),
}) {
  const discover = (read, message) => {
    try {
      return known(read());
    } catch (error) {
      warn(`warn: ${message}: ${String(error.stderr ?? "").trim() || error.message}`);
      return UNKNOWN;
    }
  };
  const trunk = trunkName(repo);
  // An explicit refspec updates the ref even where a single-branch clone does not track it.
  const fetched = discover(
    () => git(repo, "fetch", "origin", `+refs/heads/${trunk}:refs/remotes/origin/${trunk}`),
    `could not fetch origin/${trunk}; merged column may be stale`,
  );
  const prs = discover(() => {
    const list = JSON.parse(gh(GH_PR_LIST, repo));
    if (!Array.isArray(list)) throw new Error("gh returned JSON that is not an array");
    return list;
  }, "gh pr list failed; PR column will be empty");

  const worktrees = parseWorktrees(git(repo, "worktree", "list", "--porcelain", "-z")).slice(1);
  const live = worktrees.filter((worktree) => !worktree.prunable).map((worktree) => worktree.path);
  // Worktrees share ancestors, so each directory's links are read once.
  const links = new Map();
  const linksIn = (dir) => links.get(dir) ?? links.set(dir, symlinkTargets(dir)).get(dir);
  const spellings = new Map(live.map((path) => [
    path,
    discover(() => pathSpellings(path, linksIn), `could not resolve the spellings of ${path}; LAST_CHAT column will be empty`),
  ]));
  const scanFailed = "transcript scan failed; LAST_CHAT column will be empty";
  const missing = discover(
    () => transcripts.filter((root) => !statSync(root, { throwIfNoEntry: false })?.isDirectory()),
    scanFailed,
  );
  // Every root must be readable: a chat the scan could not see might be recent.
  const found = bind(missing, (roots) => {
    for (const root of roots) warn(`warn: ${root} not found; LAST_CHAT column will be empty`);
    if (roots.length) return UNKNOWN;
    const knownSpellings = new Map([...spellings].filter(([, fact]) => fact.known).map(([path, fact]) => [path, fact.value]));
    return discover(() => lastChats(transcripts, knownSpellings), scanFailed);
  });
  const chats = new Map(live.map((path) => [
    path,
    bind(spellings.get(path), () => bind(found, (latest) => known(latest.get(path) ?? null))),
  ]));

  const branchLogs = discover(
    () => new Set(git(repo, "rev-list", "--walk-reflogs", "--branches").split("\n").filter(Boolean)),
    "could not read branch reflogs; no worktree can reach safe",
  );
  const context = { repo, trunk, fetched, prs, chats, branchLogs, now };
  const rows = worktrees.map((worktree) =>
    worktree.prunable
      ? ["-", "?", "-", "-", "-", "-", "-", "prunable", "-", worktree.path]
      : auditWorktree(worktree, context),
  );
  rows.sort((a, b) => sizeKey(b[0]) - sizeKey(a[0]) || (a.join("\t") < b.join("\t") ? 1 : -1));
  return [HEADER, ...rows].map((row) => `${row.join("\t")}\n`).join("");
}

function main(argv) {
  const [repoArg, ...transcriptsArgs] = argv;
  const repo = probe(() => git(repoArg || process.cwd(), "rev-parse", "--show-toplevel"));
  if (!repo.known) {
    console.error("not in a git repo; pass a repo path");
    return 1;
  }
  const transcripts = transcriptsArgs.length ? transcriptsArgs : defaultTranscriptRoots();
  process.stdout.write(audit({ repo: repo.value, transcripts }));
  return 0;
}

// node leaves argv[1] unresolved and may set it to a non-file (`node -e ... arg`).
function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  process.exitCode = main(process.argv.slice(2));
}
