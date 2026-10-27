# GitHub Copilot tool mapping for pstack

pstack skills are written in Claude Code tool language (the `Skill` tool, the `Agent` tool, `AskUserQuestion`, Claude model names, `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/` and `~/.claude/orchestrate/` paths). On GitHub Copilot the skills are the same files; only the tool names, model IDs, and paths resolve differently. Read this when a pstack skill names a Claude tool, a driver or bundled skill, a Claude model, or a Claude Code path. It covers both the Copilot CLI and the Copilot app, which load the same plugin. This file is Copilot-specific; other runtimes use their own equivalents.

## Tool actions

| pstack / Claude action | GitHub Copilot equivalent |
|------------------------|---------------------------|
| Read a file (`Read`) | `view` |
| Create a file | `create` |
| Edit a file | `edit` |
| Run a shell command | `bash` |
| Search file contents / find files | `grep` / `glob` |
| Fetch a URL | `web_fetch` |
| Search the web | `web_search` |
| Invoke a skill (the `Skill` tool, `/command`, `pstack:<skill>`) | The `skill` tool with the bare skill name (`poteto-mode`, not `pstack:poteto-mode`). A user types `/pstack:<skill>` in the CLI prompt; on CLI 1.0.89 a bare `/<skill>` reports an unknown command for a plugin skill. Copilot's prompt lists only part of a large plugin's skills (a character budget cuts the alphabetical tail); a skill missing from that list still loads by name. |
| Dispatch a subagent (the `Agent`/`Task` tool) | The `task` tool: `agent_type`, `model`, `mode`, `name`, `prompt`. |
| Dispatch N parallel subagents in one turn | N `task` calls in one response. |
| Background subagent (`run_in_background: true`) | `task` with `mode: "background"`; you are notified when it finishes. |
| Read a subagent's result / message a running one | `read_agent` / `write_agent`; `list_agents` finds IDs you lost. |
| Track tasks (the todolist; `TaskCreate` / `TaskUpdate`, or `TodoWrite` on Claude Code) | The `sql` tool against the session database's built-in `todos` table (plus `todo_deps` for ordering). |
| Ask the human a fixed-choice question (`AskUserQuestion`) | `ask_user` with a `choices` list, one question per call. Where `ask_user` takes an elicitation form instead (`message` and a `requestedSchema`, as on Copilot CLI 1.0.89), one `oneOf` string property is the choice list. Treat it as single-select only, because the Copilot app's `ask_user` has no multi-select, and the UI adds a free-text option on its own. Emulate multi-select with sequential questions. |
| Search Claude Code transcripts under `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/` | Copilot session state, scoped to the current workspace; see Transcripts below. |

## Subagent policy

poteto-mode's Subagents section sets Claude-specific defaults (`subagent_type: "pstack:poteto-agent"`, `run_in_background: true`). On GitHub Copilot:

- The plugin's agents load as `task` agent types under their namespaced names, `pstack:poteto-agent`, `pstack:comment-sicko`, `pstack:thermo-nuclear-review-subagent`, and `pstack:thermo-nuclear-code-quality-review-subagent`. Pass the skill's `subagent_type` as `agent_type` unchanged.
- `subagent_type: "general-purpose"` maps to `agent_type: "general-purpose"`. Where a skill leaves the type unset, use `pstack:poteto-agent`.
- `readonly: true` (reviewers, explorers, critics) maps to a read-only agent type: `explore` for code reading, `code-review` for diff review. When a read-only role must run commands or reach MCP tools, use `general-purpose` and tell it in the prompt not to write files; review its diff anyway.
- `readonly: false`, or a role that needs MCP tools, maps to `general-purpose` or `pstack:poteto-agent`.
- Reasoning effort maps to `task`'s `reasoning_effort`. Pass a role value's `@<level>` suffix, or else the sheet's `default effort` level, as `reasoning_effort`; `session` omits it.
- `run_in_background: true` maps to `mode: "background"`. `mode: "sync"` blocks your turn; use it only when the next step needs the result.
- A model a skill states for a role (its Models section, an `Agent` call's `model`, or the user's sheet line) is an explicit model instruction, so pass it as `task`'s `model`. A role with no configured model omits `model`. See Model names below for how a Claude default resolves.
- Workers that write share this machine on the CLI, so the **swarm** skill's workers and the fan-out playbooks (`orchestrate`, `autopilot-full`, `autopilot-stack`) isolate writers with worktrees, as on Claude Code. In the Copilot app, `create_session` gives each writer its own worktree session instead; see App and CLI below.
- Keep the rest of the policy unchanged. Pass file pointers not inlined context, give each worker its own worktree or branch when they write, review every subagent's diff yourself.

## Model names

Skills name Claude Code model aliases in their Models sections. Those aliases are not Copilot model IDs, and the Copilot build ships no default model IDs: the models an account can reach depend on its plan and policy, so the user picks them once.

- The model sheet is `${COPILOT_HOME:-~/.copilot}/pstack-models.md`. It sits outside the workspace, so reading it asks for path access. The plugin's SessionStart hook reads it, checks it, and adds its role lines to the session context as the user's saved pstack model choices. Take role models from that block and do not `view` the sheet. A role line names the model for that role.
- Read the sheet only when that block and the hook's `sheet invalid` or no-sheet note are all missing, as in a skills-only install with no hook. `view`, `create`, and `edit` take literal paths and expand neither `~` nor `$COPILOT_HOME`, so print the sheet's absolute path with `bash` first (`echo "${COPILOT_HOME:-$HOME/.copilot}/pstack-models.md"`) and read and write exactly that path; do not append `.copilot` or any other segment to it. A session with its own `COPILOT_HOME` then never touches `~/.copilot`.
- No sheet, or the hook reports `sheet invalid`: before a skill that needs a role model (`architect`, `arena`, `how`, `interrogate`, `poteto-mode`, `reflect`, `swarm`, `why`), stop, load `setup-pstack` with the `skill` tool, and finish it first. In that same session, use the values it just wrote; later sessions get them from the hook. Do not ask again on later runs.
- A role line in the sheet is the user's explicit model instruction, so pass it as the `task` tool's `model` parameter. `inherit-parent` or `auto` omits `model`.
- The plugin's `PreToolUse` hook enforces this for pstack agents. While the sheet is valid, it denies a `task` call whose `agent_type` starts with `pstack:` and whose `model` is not one of the sheet's values, and its reason lists the saved IDs. Retry with the role's saved model; never retry on another unsaved model. It leaves calls with no `model` and other agent types alone.
- Roles that default to the worker model (`feature, refactoring`): the worker model the user chose.
- Roles that default to the strongest model (`strongest judgment`): the strongest model the user chose.
- Diverse-model panels (`arena`, `architect`, `interrogate`, `how` critics, `reflect`): the adversarial signal comes from model diversity, so fill a panel from distinct vendors in the `task` tool's `model` list (Claude, GPT, Gemini, Grok, and so on). pstack ships no default Copilot panel. If only one vendor is reachable, vary reasoning effort and note in the verdict that diversity was reduced.

`setup-pstack` lists the models from the `model` enum of the `task` tool and writes only IDs it saw there. After it writes the sheet, it runs its `check-sheet.sh` script, which applies the hook's checks.

Run `setup-pstack`, and the parent session that orchestrates a panel, on a model at least as strong as gpt-5.4-mini or a Sonnet-class Claude model. On a Haiku-class model, setup picked models the user never chose in about half of the smoke runs.

## Session routing hook

The plugin's `SessionStart` hook runs on the Copilot CLI and in the Copilot app. Copilot loads the plugin through its own Copilot manifest and hook file, not the Claude Code ones. The hook prints the routing mandate as the `additionalContext` JSON Copilot injects. It reads `${COPILOT_HOME:-~/.copilot}/pstack-models.md`, which the session itself cannot read without a path-access prompt. `session hook: off` disables injection. When the sheet passes the checks `check-sheet.sh` applies, the injected context ends with one line per role, rebuilt from the checked values; no other sheet text reaches the context. When it fails them, the context says `sheet invalid` and names each problem. With no sheet, it says so. Either way it tells the session to run `setup-pstack` before the first skill that dispatches on role models. The mandate names skills as `pstack:<skill>`; on Copilot load them by bare name.

If the mandate is missing from a session (a skills-only install, a Copilot version that drops plugin hook context, or another plugin's hook replacing it), add the standing instruction `setup-pstack` describes to `~/.copilot/copilot-instructions.md`, or request `poteto-mode` explicitly.

## Plugin file access

Copilot limits file access to the workspace and the system temporary directory, so reading a playbook, reference, or script from the installed plugin would ask for path access on every session, and a `-p` run without `--allow-all-paths` would deny it. The plugin's `PreToolUse` hook approves two kinds of call.

- `view` of a path inside `COPILOT_PLUGIN_ROOT` that has no `.` or `..` segment.
- `bash` that runs a registered script by its absolute path under `COPILOT_PLUGIN_ROOT/skills/`, using its documented arguments. The registered scripts are `log.sh` (run with `bash`), `check-sheet.sh` (run with `sh` or `bash`), and `find-transcript.mjs`, `resume.mjs`, `check-plan.mjs`, `check-playbooks.mjs`, and `worktree-audit.mjs` (run with `node`). Direct execution is also accepted. The hook checks each script's argument contract: for example, only the first of `log.sh`'s six arguments is a filename; the others are prose. Resume accepts its operation first, then `--project`, `--note`, and repeated `--artifact` paths as applicable, using either `--option=value` or `--option value`.

Each argument is a plain word of letters, digits, and `_ . / : = @ % + , -`, or a single-quoted string with no quote inside. Path operands may not climb with `..` and must resolve inside the workspace after following directory symlinks; a path in the plugin takes the normal permission flow, so no approved script can rewrite the context every session loads. File and dangling symlinks take the normal permission flow. The command holds none of `; | & $`, a backtick, `< > ( ) \`, a double quote, or a newline. Run one command per call, with no pipe or redirect. Unknown scripts, unrecognized argument forms, and mismatched interpreters take the normal permission flow.

Every other call, including a script run in any other form and `grep` or `glob` in the plugin's tree, takes the normal permission flow. So does a command that asks to bypass the sandbox, because Copilot prompts for a bypass whatever a hook answers. The hook does not approve scripts when the plugin sits inside the workspace or the workspace inside the plugin, since a session could edit a script and then run it. Where that hook does not run (a skills-only install, or hooks disabled), start the CLI with `--add-dir <plugin directory>` or run `/add-dir <plugin directory>` in the session; a GitHub marketplace install lives under `${COPILOT_HOME:-~/.copilot}/installed-plugins/<marketplace>/pstack`.

## App and CLI

The Copilot app loads the same plugin as the CLI and adds session-level tools. Use the app primitive when it is present in your tool list; otherwise use the CLI fallback.

| pstack need | Copilot app | Copilot CLI |
|-------------|-------------|-------------|
| Isolated writer (swarm worker, stack layer, orchestrate worker) | `create_session`, one worktree session per writer | `git worktree add` per writer, then `task` workers pointed at it |
| Recurring wake-up (`loop`, the `/loop` audit tick, babysit's cadence) | `save_session_automation` on this session | Re-run the step yourself each turn, or ask the user to re-invoke; state the cadence in the decision trail |
| Coordinate several sessions or repos (`orchestrate`, `autopilot-full`) | The app's `orchestrate` skill plus `send_session_message` | `task` fan-out with worktrees; `/fleet` for parallel subagents |
| Stacked PRs (`autopilot-stack`, shipping a stack) | The app's `pr-stack` skill, one child session per layer | `gh` or `origin`, one worktree per layer |
| Watch a PR to merge (`babysit`, `watch-pr`) | Agent merge on the session, or `babysit` with `save_session_automation` | `babysit` with the vendored `watch-pr` script and `gh` |
| Drive a UI | The `browser` canvas, or your browser automation | Your browser automation, or a concrete manual check for the user |

## Transcripts

Claude Code keeps one directory per project under `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/<encoded-cwd>/`. Copilot keeps one directory per session under `${COPILOT_HOME:-~/.copilot}/session-state/<session-id>/`, for every project together:

- `events.jsonl` is the transcript. The first record is `session.start` with `data.context.cwd`; user turns are `{"type":"user.message","data":{"content":...}}`.
- `workspace.yaml` names the session's `cwd`. Scope every transcript search to the current workspace: keep only session directories whose `cwd` is the workspace path (or a worktree of it), then read their `events.jsonl`. Never read other projects' sessions.
- When a skill says "this session's transcript", it is the newest matching session directory whose `events.jsonl` contains the opening prompt.

In poteto-mode's playbooks, `eval` reads candidate transcripts from Copilot session state, and `session-pickup` and `worktree-cleanup` search it scoped to the workspace. `orchestrate` and `multi-phase-plan` keep their store under `${COPILOT_HOME:-~/.copilot}/orchestrate/` instead of `~/.claude/orchestrate/`.

## Driver and bundled skills pstack references

The [driver policy](../SKILL.md#non-negotiables) selects the app driver. For skills and drivers named by these workflows, use these Copilot equivalents:

| Skill or driver named in pstack | On GitHub Copilot |
|---------------------------------|-------------------|
| `run` (drive a CLI/TUI to see a change work) | Run the app yourself via `bash` and observe the real output. |
| Project UI driver | Drive the UI with whatever automation you have (the app's `browser` canvas, a browser skill), or hand the user a concrete manual check. Do not claim done without observing the artifact. |
| `plugin-dev:skill-development` (Claude's SKILL.md authoring guidance) | Follow the Agent Skills conventions: a `SKILL.md` with `name` + `description` frontmatter, progressive disclosure into `references/`, and poteto-mode's [authoring-a-skill playbook](../playbooks/authoring-a-skill.md). |
| `loop` (recurring/self-paced re-invocation, used by `babysit`) | Copilot has no `loop` skill. In the app use `save_session_automation`; on the CLI re-run the step yourself on a cadence. |

## Per-skill notes

Affected skill entry points point here. Most skills need only the tables above. These need one more mapping:

| Skill | On GitHub Copilot |
|-------|-------------------|
| `interrogate` | Each reviewer is a `task` call: `subagent_type` becomes `agent_type`, `readonly: true` becomes a read-only agent type (see Subagent policy), and `model` comes from the sheet. Keep the panel's vendors distinct. |
| `setup-pstack` | The skill's Other runtimes table names the Copilot sheet path and how it loads. Its [Copilot setup questions](../../setup-pstack/copilot.md) list models from the `task` tool's `model` enum and ask one `ask_user` question per tier and panel slot, grouped by vendor, with no recommended model; a first question lets a plan with one model, or anyone who wants no per-role choices, run every role on the session's model. The role rows are identical; the `session hook` line also controls the Copilot hook. |
| `architect` | The runner panel goes through the **arena** skill: one `task` per runner, each with a model from the sheet's `architect runners` line. |
| `how` | The explorers and the explainer are `task` calls with the sheet's `how` role models; critics use a read-only agent type (see Subagent policy). |
| `arena` | Runners and the cross-judge pool come from the sheet's panel lines; pick the cross-judge from a different vendor than the candidate it grades. |
| `no-comments` | Dispatch `task` with `agent_type: "pstack:comment-sicko"`. |
| `thermos` | Dispatch two `task` calls with `mode: "background"`, `agent_type: "pstack:thermo-nuclear-review-subagent"` and `agent_type: "pstack:thermo-nuclear-code-quality-review-subagent"`, each with the same diff and file contents in its prompt. |
| `swarm` | Workers are `task` calls with `mode: "background"`, each on its own worktree; in the app, `create_session` per worker. |
| `teach` | Running `how` and `why` in parallel maps to `task` fan-out; image generation uses whatever image tool you have, or skip it and say so. |
| `why` | Available MCP servers appear in your tool list; there is no `mcp__` prefix convention to scan for. |
| `reflect` | Run `find-transcript.mjs <session-state directory> '<opening prompt fragment>' <workspace directory>` with the absolute session-state path under `${COPILOT_HOME:-~/.copilot}`. The workspace defaults to the current directory when omitted. The finder checks the session header's `cwd` against that workspace before reading Copilot's `user.message` records, so matching prompts in other projects are skipped. For a conversation in a related worktree, pass that worktree's directory explicitly. Reviewer references that name `.claude/skills/` and `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/` paths mean the Copilot skill locations below. |
| `recall` | Search Copilot session state scoped to the current workspace (Transcripts above), not `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/`. |
| `show-me-your-work` | The end-of-run check reads this session's `events.jsonl` (Transcripts above). |
| `automate-me` | Mode skills live in the Copilot skill locations below; transcripts come from Transcripts above; `plugin-dev:skill-development` resolves through the skills table. |
| `create-verification-skill` | The generated skill lands under `.claude/skills/verify/` on Claude Code; on Copilot write it to `.github/skills/verify/`. The app-driving harness is platform-neutral. |
| `maintain-verification-skill` | The parallel per-feature source readers map to `task` fan-out; the project-local skill lives under `.github/skills/`, not `.claude/skills/`. |
| `create-formal-verification-skill` | On Copilot write the generated skill to `.github/skills/<area>/`, named for the area it verifies. The verifier and its run command are platform-neutral. |
| `maintain-formal-verification-skill` | Project skills, the formal verification skill among them, live under `.github/skills/`. |
| `babysit` | `loop` and `AskUserQuestion` resolve through the tables above; in the app, `save_session_automation` is the cadence. |

## Vendored scripts

`skills/poteto-mode/scripts/` ships the `watch-pr` PR watcher, the `orch` store CLI, `resume.mjs`, and `worktree-audit.mjs`. They use bun and Node.js and run the same on Copilot; invoke them through `bash` in the form Plugin file access above describes. They need `bun` and `gh`, or `origin` when the forge is Origin. `worktree-audit.mjs` finds each worktree's last chat in Claude Code transcripts under `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/`, in Codex and Pi sessions, and in Copilot sessions under `${COPILOT_HOME:-~/.copilot}/session-state`. Pass transcript directories after the repo path to scan others instead. It imports the transcript walker from `skills/reflect/scripts/find-transcript.mjs`, so keep the `reflect` skill installed beside `poteto-mode`.

## Instructions file

Where a pstack skill says "your instructions file" or `CLAUDE.md`, on Copilot that is `AGENTS.md` or `.github/copilot-instructions.md` in the repository, and `~/.copilot/copilot-instructions.md` for every repository. Copilot also reads a repository's `CLAUDE.md`. Copilot does not expand `@~/` includes in user-level instructions, so the plugin hook injects the model sheet's role lines instead, as Model names above describes.

## Skill locations

Where a pstack skill names `.claude/skills/`, on Copilot project skills live under `.github/skills/` (Copilot also reads `.claude/skills/` and `.agents/skills/`), and personal skills under `~/.copilot/skills/` or `~/.agents/skills/`.
