# Muse tool mapping for pstack

pstack skills are written in Claude Code tool language (the `Skill` tool, the `Agent` tool, `AskUserQuestion`, Claude model names). On Muse the skills are the same files, loaded from the pstack Muse plugin; only the tool names resolve differently. Read this when a pstack skill names a Claude tool, a driver or bundled skill, or a Claude model. This file is Muse-specific. Other runtimes must use their own concrete tools, model names, and configuration paths.

## Tool actions

| pstack / Claude action | Muse equivalent |
|------------------------|---------------|
| Read a file | `read_file` |
| Create a file | `write_file` |
| Edit a file | `edit_file` (one exact text replacement) |
| Delete a file | `bash` (`rm`) |
| Run a shell command | `bash` |
| Search file contents / find files | `search`, otherwise `bash` (`rg`, `grep`, `find`, `ls`) |
| Fetch a URL | `web_fetch` |
| Search the web | `web_search` |
| Invoke a skill (the `Skill` tool, `/command`) | `read_skill` with the plugin skill id (`plugin:pstack:poteto-mode`), then follow its body. Muse lists each user-invocable skill as `/<name>` itself. |
| Dispatch a subagent (the `Agent`/`Task` tool) | `subagent_spawn` (one child agent with a role and objective), or a Workflow child when the step needs model control or many parallel workers |
| Dispatch N parallel subagents in one turn | N `subagent_spawn` calls in one response, or one Workflow run fanning out over its items |
| Wait for a subagent result | `subagent_wait`, or end the turn: finished results arrive on their own. `subagent_read_result` reads a finished result again. |
| Continue or steer a subagent (`SendMessage`) | `subagent_send_message`, addressed by the subagent id the spawn returned |
| Stop a subagent | `subagent_cancel`; `subagent_status` lists what is running |
| Track tasks (the todolist; `TaskCreate` / `TaskUpdate`, or `TodoWrite` on Claude Code) | `write_todos` |
| Ask the human a fixed-choice question (`AskUserQuestion`) | `request_user_input` with two or three options per question. When it is withheld for the run, ask in plain text. |
| Schedule a self-paced re-invocation (`ScheduleWakeup`, the `loop` skill) | `cron_create` for a cadence, or `monitor` to watch a long-running source. There is no one-shot wake-up call. |
| Read this workspace's session transcripts (Claude Code's projects directory) | Muse sessions live at `${XDG_DATA_HOME:-~/.local/share}/muse/sessions/YYYY/MM/DD/<session-id>/session.jsonl`. Read only the sessions for this workspace, never a glob across every project. |

A skills-only setup (the skills without the plugin) still has every tool above, since they are Muse's own tools. It lacks the plugin's agent definitions and routing hook, so read the Subagent policy fallback there.

## Subagent policy

poteto-mode's Subagents section sets Claude-specific defaults (`subagent_type: "pstack:poteto-agent"`, `run_in_background: true`). On Muse:

- The plugin's four agent files register as agent definitions with scoped ids: `pstack/poteto-agent`, `pstack/comment-sicko`, `pstack/thermo-nuclear-review-subagent`, and `pstack/thermo-nuclear-code-quality-review-subagent`. Pass the scoped id as `subagent_spawn`'s `subagent_type`, or as a Workflow child's `agentType`. Map a skill's `pstack:poteto-agent`, and each other `pstack:<name>` dispatch, to `pstack/<name>` unchanged otherwise. `general-purpose`, or no type, runs the built-in general agent. In a skills-only setup none of these definitions exist: route an ad-hoc subagent through poteto-mode's style by telling it to read the `poteto-mode` skill in full first, and a `comment-sicko` dispatch to read the `comment-sicko` reference under `poteto-mode/references/agents/` first.
- `subagent_spawn` children already run alongside your turn, so `run_in_background: true` has no separate flag. Issue the dispatch and continue; the result arrives when the child finishes.
- `readonly: true` (reviewers, explorers, critics) has no flag. Say in the objective that the child must not change files, and review its diff anyway.
- A role value's `@<level>`, or the `default effort` line, passes as the dispatch's effort field: `effort` on a Workflow child. `subagent_spawn` has no effort field and keeps the session's effort, so name the level it needs in the objective when the job turns on it. `session` sets nothing.
- `isolation: "worktree"` maps to `worktree_isolation` on `subagent_spawn`, or `isolation` on a Workflow child. Muse runs every subagent on this machine, so the **swarm** skill's workers and the fan-out playbooks (`orchestrate`, `autopilot-full`, `autopilot-stack`) isolate writers with worktrees, as on Claude Code.
- A completion notice on Muse means the child finished; the Claude Code caveat about a `completed` agent that keeps running does not apply. Stop an agent you abandon with `subagent_cancel` and confirm it stopped before replacing it.
- Keep the rest of the policy unchanged. Pass file pointers not inlined context, give each worker its own worktree or branch when they write, review every subagent's diff yourself.

## Model names

Skills name Claude defaults (a single-role default for code/prose/judgment, a worker model for feature and refactoring code, plus a diverse-model panel for diverse-model panels; each model-consuming skill lists its own in a Models section). These slugs do not resolve on Muse. Substitute your configured Muse models:

- Single-model roles: your primary Muse model (for example `muse-wonder-1.0`).
- Roles that default to the Claude worker model (`feature, refactoring`): your fast Muse model (for example `muse-spark-1.3`).
- Roles that default to the strongest Claude model (`strongest judgment`): your strongest Muse model (for example `muse-wonder-full-1.0`).
- Diverse-model panels (`arena`, `architect`, `interrogate`, `how` critics, `reflect`): the adversarial signal comes from model diversity, so use the distinct Muse models available to you. A good default panel is `muse-wonder-full-1.0`, `muse-wonder-1.0`, `muse-spark-1.3`. Muse serves one model family, so vary reasoning effort across the panel too and note in the verdict that diversity was reduced.

Pass a role's model where the dispatch takes one: a Workflow child's `model`, or the session model when the dispatch has no model field. `subagent_spawn` takes an agent definition, not a model, so a role dispatched that way runs on the session's model and effort; a Workflow child takes both (see Subagent policy). `inherit-parent` or `auto` omits `model`.

`/setup-pstack` writes the configured model list. On Muse, set it to your Muse model IDs, as `muse model-profile` and the model catalog name them.

## Session routing hook

The native pstack Muse plugin bundles a `SessionStart` hook that injects the poteto-mode mandate in Muse wording, plus the saved role lines from the Muse sheet when the sheet has any. Muse runs plugin hooks only after the user approves them (`muse plugins approve pstack`), so a fresh install routes nothing until then. The hook reads `session hook` from the Muse sheet, at the path in [setup-pstack's runtime table](../../setup-pstack/SKILL.md#other-runtimes); `session hook: off` disables injection.

A skills-only installation does not include the hook. Request `poteto-mode` explicitly or add a standing instruction to `AGENTS.md` in that case.

## Driver and bundled skills pstack references

The [driver policy](../SKILL.md#non-negotiables) selects the app driver. For skills and drivers named by these workflows, use these Muse equivalents:

| Skill or driver named in pstack | On Muse |
|---------------------------------|---------|
| `run` (drive a CLI/TUI to see a change work) | Run the app yourself via `bash` and observe the real output. |
| Project UI driver | Drive the UI with whatever automation you have, or hand the user a concrete manual check. Do not claim done without observing the artifact. |
| `plugin-dev:skill-development` (Claude's SKILL.md authoring guidance) | Follow Muse's bundled skill-authoring guidance and the Agent Skills shape. Keep `name` plus `description` frontmatter and progressive disclosure. |
| `loop` (recurring/self-paced re-invocation, used by `babysit`) | `cron_create` on a cadence, or `monitor` on the PR or job. Re-run the step yourself when neither fits. |

## Per-skill notes

Affected skill entry points point here. Most skills need only the tables above. These need one more mapping:

| Skill | On Muse |
|-------|---------|
| `interrogate` | The reviewer dispatch maps to parallel `subagent_spawn` calls or Workflow children; use Workflow children when the panel needs distinct models, and keep the panel model-diverse (see Model names). |
| `setup-pstack` | The skill's Other runtimes table names the Muse sheet path; the plugin hook injects its role lines, so no include line is needed. The role rows are identical. |
| `no-comments` | The `comment-sicko` dispatch resolves through `subagent_spawn` as written, with the scoped id (see Subagent policy). Run it without worktree isolation, so it sees the scope's uncommitted changes. |
| `thermos` | Both review dispatches resolve through `subagent_spawn` with their scoped ids (see Subagent policy). |
| `teach` | Running `how` and `why` in parallel maps to two `subagent_spawn` calls in one response. Draw with Mermaid or plain text when no image tool is available. |
| `create-verification-skill` | Write the generated skill where Muse discovers project skills, `.agents/skills/verify/`, instead of under `.claude/skills/`. The app-driving harness is platform-neutral. |
| `maintain-verification-skill` | The parallel per-feature source readers map to `subagent_spawn` fan-out; the project-local skill lives under `.agents/skills/`. |
| `create-formal-verification-skill` | Write the generated skill to `.agents/skills/<area>/`, named for the area it verifies. The verifier and its run command are platform-neutral. |
| `maintain-formal-verification-skill` | Project skills, the formal verification skill among them, live under `.agents/skills/`. |
| `babysit` | `loop` and `AskUserQuestion` resolve through the tables above. |
| `automate-me` | The skill-authoring guidance resolves through the skills table above. The workspace's transcripts are its Muse sessions (see Tool actions), and the mode skill lands in the Muse user skills directory or `.agents/skills/`. |
| `architect` | The runner panel goes through the **arena** skill, so its fan-out and model substitution apply here too. |
| `arena` | The parallel candidates and the cross-judge are Workflow children or `subagent_spawn` calls on the configured Muse models (see Model names). |
| `how` | The parallel explorers and the explainer map to `subagent_spawn` fan-out; substitute your configured Muse models. |
| `reflect` | The three reviewers and the synthesizer map to `subagent_spawn` fan-out. The transcript finder reads Claude Code's layout, so pass the session digest step 1 allows instead. |
| `swarm` | Each worker is a `subagent_spawn` call or a Workflow child; give each writing worker worktree isolation or its own output directory (see Subagent policy). |
| `why` | The parallel investigators and the synthesizer map to `subagent_spawn` fan-out; substitute your configured Muse models. List MCP servers from the tools Muse exposes to the session, not from Claude Code's MCP files. |
| `typescript-best-practices` | Its frontmatter `paths` scoping is Claude Code metadata on Muse; invoke it by name for TypeScript work. |
| `recall` | Search this workspace's Muse sessions (see Tool actions), not Claude Code's projects directory. |
| `show-me-your-work` | Check the log against this run's Muse session file (see Tool actions), not a Claude Code transcript. |

## Vendored scripts

`skills/poteto-mode/scripts/` ships the `watch-pr` PR watcher, the `orch` store CLI, and `worktree-audit.mjs`. These scripts use bun and Node.js and run the same on Muse; invoke them through `bash`. They need `bun` and `gh`, or `origin` when the forge is Origin. Run `worktree-audit.mjs` with `node`, as its shebang does. The audit finds each worktree's last chat only in the transcript directories that exist (Claude Code, Codex, Pi); it does not scan Muse sessions, so pass a Muse sessions directory explicitly when a worktree's last chat was a Muse one. It imports the transcript walker from the `reflect` skill, so keep the `reflect` skill installed beside `poteto-mode`.

## Instructions file

Where a pstack skill says "your instructions file", on Muse that is `AGENTS.md`, which Muse reads from the workspace (and which `muse init` scaffolds). On Claude Code it is `CLAUDE.md`.
