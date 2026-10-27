# Pi tool mapping for pstack

pstack skills are written in Claude Code tool language (the `Skill` tool, the `Agent` tool, `AskUserQuestion`, Claude model names). On Pi the skills are the same files, loaded from the pstack package, and the package's Pi extension registers tools named after the Claude ones, so most names map one to one. Read this when a pstack skill names a Claude tool, a driver or bundled skill, or a Claude model. This file is Pi-specific.

## Tool actions

| pstack / Claude action | Pi equivalent |
|------------------------|---------------|
| Read a file | `read` |
| Create a file | `write` |
| Edit a file | `edit` (exact text replacement) |
| Delete a file | `bash` (`rm`) |
| Run a shell command | `bash` |
| Search file contents / find files | `grep`, `find`, and `ls` when enabled, otherwise `bash` (`rg`, `grep`, `find`, `ls`). Pi enables only `read`, `bash`, `edit`, and `write` by default. |
| Fetch a URL | `bash` with `curl` / `wget` |
| Search the web | Pi has no web search tool. Use an MCP server that provides one. |
| Invoke a skill (the `Skill` tool, `/command`) | Skills load natively. The model reads a skill when its description matches; `/skill:<name>` forces one. |
| Dispatch a subagent (the `Agent`/`Task` tool) | `agent` |
| Dispatch N parallel subagents in one turn | N `agent` calls with `run_in_background: true` in one response |
| Wait for a subagent result | A foreground `agent` call returns the final text. A background agent's completion arrives as a message naming its id, status, and final text, after your current tool calls or as a new turn when you are idle, so do not poll. |
| Continue or steer a subagent (`SendMessage`) | `send_message`, addressed by agent id or description |
| List subagents | `list_agents`. Its `sessionFile` field is the agent's transcript, written once the first message is in. To let the user watch a running agent, give them `tail -f <sessionFile>`; for a finished one, `pi --export <sessionFile>` renders it as HTML. A running agent's `activity` field gives its current or last tool call and latest message. The user can run `/pstack-agents` for the same view. |
| Stop a subagent | `stop_agent` |
| Track tasks (the todolist; `TaskCreate` / `TaskUpdate`, or `TodoWrite` on Claude Code) | Pi has no task-tracking tool. Keep the `todo.md` checklist poteto-mode describes for that case. |
| Ask the human a fixed-choice question (`AskUserQuestion`) | `ask_user_question`, same shape. Without an interactive UI (print or JSON mode), and in a child agent, it returns an error, so ask in plain text. |
| Schedule a self-paced re-invocation (`ScheduleWakeup`) | `schedule_wakeup`, same shape. A due wakeup stays pending until the session is idle, including during manual compaction. `noop: true` only labels the wakeup, which is still scheduled, and `stop: true` cancels the pending wakeup and needs no other field. In print and JSON mode, and in a child agent, scheduling returns an error, because Pi exits when the run ends and the wakeup could never fire. After a `/loop` command ends or replaces the loop during a run, that run is refused every wakeup until it settles, whatever the prompt, and Pi tells the user. No other wakeup is refused. |
| Read this workspace's session transcripts (Claude Code's `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/<encoded-cwd>/`) | Pi sessions live in `~/.pi/agent/sessions/--<cwd>--/` (under `$PI_CODING_AGENT_DIR` when set), where `<cwd>` is the working directory without its leading `/` and with each `/` as `-`. Subagent sessions the extension started live in `<agent dir>/pstack/<parent session id>/agents/`. Each file opens with a `session` header line; every later line is an entry with an `id` and a `parentId`, and a message entry is `type: "message"` with `message.role` `user`, `assistant`, or `toolResult`. A session keeps abandoned branches in the same file, so follow `parentId` back from the last entry for the conversation that happened. The same privacy rule applies: read only this workspace's directory, never a glob across `sessions/`. |

`agent`, `send_message`, `list_agents`, `stop_agent`, `ask_user_question`, and `schedule_wakeup` come from the pstack Pi extension, which `pi install` of the pstack package loads. A skills-only setup has none of them, and the fan-out skills (`interrogate`, `why`, `how`, `arena`, `reflect`) degrade to a single sequential pass. A required independent review does not degrade. It stays blocked, as poteto-mode's [Subagents](../SKILL.md#subagents) section says.

## Subagent policy

poteto-mode's Subagents section applies on Pi through the `agent` tool:

- `subagent_type` takes the same values. `pstack:poteto-agent`, `pstack:comment-sicko`, `pstack:thermo-nuclear-review-subagent`, and `pstack:thermo-nuclear-code-quality-review-subagent` resolve to the plugin's agent files. `general-purpose`, or no `subagent_type`, runs a child with no agent file. Claude Code's built-in types such as `Explore` and `Plan` do not exist on Pi, so use `general-purpose` and put the constraint in the prompt. An unknown type errors and lists the valid ones.
- `readonly: true`, which the `how` and `interrogate` panels set, runs the child without the `edit` and `write` tools. It keeps `bash`, so a reviewer can still run `git diff`; say in the prompt that it must not change files.
- Each child is its own `pi --mode rpc` process in your working directory, and the extension sends it the prompt on its stdin. It loads the packages and settings saved on disk, so it sees the pstack skills when pstack was installed with `pi install`. It does not inherit the parent's command-line flags, such as `-e`, `--api-key`, or a one-off `-a` project trust, so a pstack loaded only through `-e` gives children no extension.
- A child can start its own agents, down to three layers below the main session, as on Claude Code. A child at the third layer runs without the `agent` tool.
- `isolation: "worktree"` runs the child in its own git worktree under `.claude/worktrees/`. A worktree the agent left nothing in is removed when the agent finishes; a change, a gitignored file it wrote, or a commit on its branch or on any commit its HEAD visited keeps it.
- `run_in_background: true` returns the agent id at once. The completion joins the conversation after your current tool calls finish, as on Claude Code, or starts a turn when you are idle. In print and JSON mode (`pi -p`), where Pi exits once the run settles, the extension holds the settle while a background agent runs, so each completion still arrives as a turn and the process ends after the last one. A child agent holds its settle the same way while its own background agents run, because its parent closes its stdin once it settles, and a message from the parent ends the hold. Interactive and RPC main sessions settle as usual and take the completion when it arrives.
- While a background agent runs, the extension blocks a `bash` command line in which the word `sleep` is followed by a literal duration of two seconds or more, anywhere in the line, poll loops included: `sleep 30`, `npm test; sleep 30`, `until gh pr checks 1; do sleep 30; done`, `sleep infinity`. A shorter sleep, a sleep backgrounded as `sleep 30 &`, and `sleep` inside a quoted string, a comment, or a heredoc all run. The rule errs toward blocking, so `timeout 5 sleep 30` and a sleep inside a backgrounded group are blocked too. The completion notice arrives on its own, so continue other work or end your turn.
- An agent's status follows its process. `completed` means the child exited, and `stop_agent` reports `stopped` only once the child has exited, so the Claude Code caveat about a `completed` agent that keeps running does not apply to the agent itself. Stopping an agent, like the session shutdown that stops every agent, ends the child pi and the `bash` command it still has running, because Pi kills that command's process tree on SIGTERM. A process that a finished `bash` command left in the background (`cmd &`, `nohup cmd`) runs in its own process group and outlives the agent; stop it yourself. A stopped agent's notice joins the conversation without starting a turn, since `stop_agent` already returned.
- Agents belong to the session that started them. Quitting, reloading, and starting, resuming, or forking a session all stop every running agent, and a parent process that exits signals its agents to stop. On restore, an agent still running under its launching Pi process is left alone. An orphan whose process identity matches the saved record is signalled to stop, and remains unavailable to `send_message` and `stop_agent` until its process exits. Without enough identity data to signal it safely, its process is left alone and continuation is refused until its exit is confirmed. Only then is the restored agent marked `stopped` and allowed to resume.
- `send_message` to a running agent is an RPC `steer` on the child's stdin. The agent reads it after its current tool calls, as on Claude Code, carries on in the same run, and sends one completion notice. A message the child rejects returns an error, and the agent keeps running. A message to a finished agent resumes its session in the background with the context of its earlier runs. A message that arrives after the agent settled but before its process exited resumes the agent once the process has exited.
- A role value's `@<level>`, or the sheet's `default effort` level, is passed as the `agent` tool's `effort`, which the extension passes to the child as `--thinking`. `session` omits it and runs the child at the parent's current thinking level.
- Keep the rest of the policy unchanged. Pass file pointers not inlined context, give each worker its own worktree when they write, review every subagent's diff yourself.

## Model names

Skills name models by the Claude aliases in their Models sections. On Pi, pass the alias as the `agent` tool's `model`. The pstack extension resolves it in the column of the provider the session's current model comes from, and in the `anthropic` column for any other provider:

| Alias | `anthropic` | `openai` | `openai-codex` |
| --- | --- | --- | --- |
| `opus` | `anthropic/claude-opus-5-5` | `openai/gpt-6.1-sol` | `openai-codex/gpt-6.1-sol` |
| `fable` | `anthropic/claude-fable-5-1` | `openai/gpt-6-astra` | `openai-codex/gpt-6-astra` |
| `sonnet` | `anthropic/claude-sonnet-5-5` | `openai/gpt-6-sol` | `openai-codex/gpt-6-sol` |
| `haiku` | `anthropic/claude-haiku-5-5` | `openai/gpt-6-luna` | `openai-codex/gpt-6-luna` |

Pi warns that Anthropic bills Claude used through Pi per token, as extra usage, even on a Claude subscription. Pi shows that warning only in interactive mode, never for the `pi --mode rpc` children the `agent` tool runs.

A `pi models: opus=<provider/id>, sonnet=<provider/id>` line in the Pi override sheet points each alias it names at another Pi model, whatever the session's provider. Add one when the session's provider has no column above and Pi has no credentials for `anthropic`, because each alias then resolves to an `anthropic/*` ID and the `agent` call fails with `No API key found for anthropic`. The `agent` tool also takes a full `provider/id`, passed through unchanged, and `inherit-parent`, `auto`, or no `model` runs the child on the parent's current model. Diverse-model panels (`arena`, `architect`, `interrogate`, `how` critics, `reflect`) stay diverse only while their aliases resolve to distinct models. If one model family is all you can reach, vary the reasoning effort and note in the verdict that diversity was reduced.

`/setup-pstack` writes the configured model list. On Pi, keep the aliases and remap them with `pi models:`.

## Session routing

The pstack Pi extension adds the poteto-mode mandate, the text the Claude Code and Codex `SessionStart` hook injects, to the system prompt at every agent start, so the mandate survives compaction. It also adds the Pi override sheet, because Pi has no include syntax for context files. The sheet is `pstack-models.md` in the Pi agent directory, which is `$PI_CODING_AGENT_DIR` when set and `~/.pi/agent` otherwise. `session hook: off` in the sheet stops the mandate. Child agents that the `agent` tool starts get the sheet but not the mandate, as Claude Code subagents see CLAUDE.md but run no `SessionStart` hook. Every session, child agents and sessions with the hook off included, also gets a pointer to this file and Claude Code's sentence on making independent tool calls in one response.

Without the extension nothing is injected. Request `poteto-mode` explicitly with `/skill:poteto-mode`, or add a standing instruction to `AGENTS.md`.

## Driver and bundled skills pstack references

The [driver policy](../SKILL.md#non-negotiables) selects the app driver. For skills and drivers named by these workflows, use these Pi equivalents:

| Skill or driver named in pstack | On Pi |
|---------------------------------|-------|
| `run` (drive a CLI/TUI to see a change work) | Pi has no `run` skill. Run the app yourself via `bash` and observe the real output. |
| `verify` (the project's `.claude/skills/verify/`, or Claude Code's bundled `/verify`) | Pi does not discover `.claude/skills/`. Read the project skill's SKILL.md by path, or add `../.claude/skills` to the `skills` list in `.pi/settings.json`. Without a project skill, drive the app as for `run`. |
| Project UI driver | Drive the UI with whatever automation you have, or hand the user a concrete manual check. Do not claim done without observing the artifact. |
| `plugin-dev:skill-development` (Claude's SKILL.md authoring guidance) | Follow Pi's skills documentation and the Agent Skills specification. Keep `name` + `description` frontmatter, name the directory after the skill, and use progressive disclosure. |
| `loop` (recurring/self-paced re-invocation, used by `babysit`) | The extension's `/loop [interval] <prompt>` command. With an interval it re-fires on that cadence. Without one the prompt runs now and the model paces itself with `schedule_wakeup`. `/loop stop` cancels, also while an iteration runs: nothing that run then schedules is armed. A `/loop` given during a run starts once that run ends. |

## Per-skill notes

No skill file carries a Pi line. poteto-mode's Platform Adaptation section points here once, and the extension's system prompt points here in every session, so read a skill's row before you follow that skill. Most skills need only the tables above. These need one more mapping:

| Skill | On Pi |
|-------|-------|
| `poteto-mode` | The todolist falls back to `todo.md`, and the Subagents defaults map through Subagent policy above. The Eval and Session pickup playbooks read transcripts from the Pi sessions directory (see Tool actions). |
| `interrogate` | Reviewers dispatch through `agent` with the same `subagent_type`, `model`, and `readonly` (see Subagent policy). Keep the panel on distinct models (see Model names). |
| `recall` | Search the Pi sessions directory for this workspace (see Tool actions). Do not list or read `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/`: it holds Claude Code transcripts, not this session's history. Match on `type: "message"` entries and their `message.role`. |
| `show-me-your-work` | Check the log against this run's Pi session file (see Tool actions), not a Claude Code transcript. |
| `setup-pstack` | The Pi sheet is `pstack-models.md` in the Pi agent directory (see Session routing), and the extension loads it, so no include line is needed. List models with `pi --list-models`. For a family whose model is not listed, offer a `pi models:` line (see Model names). The role rows and the five effort levels are identical. The `session hook` line applies on Pi too, where `off` stops the extension adding the mandate. When the session runs on `anthropic`, tell the user that Pi bills Claude per token as extra usage and that each multi-model panel multiplies that cost. |
| `no-comments` | `pstack:comment-sicko` resolves through `agent` as written. Pass it the scope, not a request to run `/no-comments`, and run it without `isolation: "worktree"`, because a worktree starts from `HEAD` and lacks the scope's uncommitted changes. |
| `teach` | Running `how` and `why` in parallel maps to two background `agent` calls. Pi has no image generation tool, so draw with Mermaid or plain text. |
| `create-verification-skill` | The generated skill lands under `.claude/skills/verify/` on Claude Code. Write it where Pi discovers project skills, `.pi/skills/verify/` or `.agents/skills/verify/`, instead. The app-driving harness is platform-neutral. |
| `maintain-verification-skill` | The parallel per-feature source readers map to background `agent` calls. The project-local skill lives under `.pi/skills/` or `.agents/skills/`, not `.claude/skills/`. |
| `create-formal-verification-skill` | Write the generated skill where Pi discovers project skills, `.pi/skills/<area>/` or `.agents/skills/<area>/`, named for the area it verifies. The verifier and its run command are platform-neutral. |
| `maintain-formal-verification-skill` | Project skills, the formal verification skill among them, live under `.pi/skills/` or `.agents/skills/`. |
| `babysit` | `loop` and `AskUserQuestion` resolve through the tables above. |
| `automate-me` | `plugin-dev:skill-development` resolves through the skills table above. The workspace's transcripts are its Pi sessions directory (see Tool actions). Pi does not discover `.claude/skills/`, so write the mode skill to `.pi/skills/<handle>-mode/SKILL.md` or `.agents/skills/<handle>-mode/SKILL.md` instead. |
| `architect` | The runner panel goes through the **arena** skill, so its `agent` fan-out and model aliases apply here too. |
| `arena` | The parallel candidates and the cross-judge are background `agent` calls on the configured aliases (see Model names). |
| `how` | The parallel explorers and the explainer are `agent` calls, and `readonly` applies as written (see Subagent policy). |
| `reflect` | The three reviewers and the synthesizer are background `agent` calls. The transcript finder reads Pi sessions too. Pass it this workspace's Pi sessions directory (see Tool actions) in place of Claude Code's projects directory. It follows the session's active branch to its opening prompt. Skill files load from the Pi package directory that `pi list` shows, not `${CLAUDE_CODE_PLUGIN_CACHE_DIR:-${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins}/`, so treat reads under that directory as plugin skill reads. |
| `swarm` | Each worker is a background `agent` call on the configured alias. Give each writing worker `isolation: "worktree"` or its own output directory (see Subagent policy above). |
| `why` | The parallel investigators and the synthesizer are background `agent` calls. List MCP servers from the tools Pi exposes to the session or `pi mcp list`, not from `.mcp.json` or `claude mcp list`. Spawn the synthesizer only after every investigator's completion notice has arrived, because those notices carry the findings the synthesizer gets. A `send_message` to an investigator returns no findings, so wait for its notice. |

## Vendored scripts

`skills/poteto-mode/scripts/` ships the `watch-pr` PR watcher, the `orch` store CLI, and `worktree-audit.mjs`. These scripts use bun and Node.js and run the same on Pi; invoke them through `bash`. They need `bun` and `gh`, or `origin` when the forge is Origin. Run `worktree-audit.mjs` with `node`, as its shebang does. The audit follows each link in a worktree's ancestor directories with `stat` and matches it by the directory it lands on, under bun and node alike. A worktree whose own path bun cannot resolve loses its last chat and lands in `review`. A dangling or looping link is ignored. Any other link that `stat` cannot follow puts every worktree under the link's directory in `review`, with a warning that names the link. `worktree-audit.mjs` finds each worktree's last chat in every runtime's transcript directory that exists: Claude Code's projects under `$CLAUDE_CONFIG_DIR` (default `~/.claude`), Codex's sessions and archived sessions under `$CODEX_HOME` (default `~/.codex`), and Pi's `sessions/` and the pstack extension's subagent sessions under `$PI_CODING_AGENT_DIR` (default `~/.pi/agent`). Pass transcript directories after the repo path to scan others instead. It imports the transcript walker from `skills/reflect/scripts/find-transcript.mjs`, so keep the `reflect` skill installed beside `poteto-mode`.

## Instructions file

Where a pstack skill says "your instructions file", on Pi that is `AGENTS.md` or `CLAUDE.md`, which Pi loads from the working directory and each parent directory, plus `~/.pi/agent/AGENTS.md` for every directory. On Claude Code it is `CLAUDE.md`.
