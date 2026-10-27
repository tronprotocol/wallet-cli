# Vendored pstack skills

A subset of the skills from [pstack-claude](https://github.com/michael-denyer/pstack-claude)
(a Claude Code port of Lauren Tan's pstack), copied unmodified so Claude sessions working in this
repository can invoke them by name.

- Source commit: `36885ea631d2afd9482cf9333cc4bbc829b3b02d` (2026-10-26, plugin version 0.9.103)
- License: MIT — see `LICENSE`, `LICENSE-cursor-team-kit`, `LICENSE-thermos`, `NOTICE.md`,
  `NOTICE-skills.md` in this folder.

## What is included

| Skill | Use it for |
| --- | --- |
| `poteto-mode` | Entry point; picks a playbook (refactoring, feature, bug fix, multi-phase plan…) |
| `figure-it-out` | Large, multi-part changes such as the `ts/` architecture realignment |
| `architect`, `arena` | Designing types / ports before code, with parallel candidate designs |
| `swarm` | Fanning out parallel workers (e.g. one auditor per architecture rule) |
| `interrogate` | Multi-model adversarial review of a change |
| `blast-radius` | Finding what a change could break outside its diff |
| `how`, `why` | Explaining a subsystem; "which layer should own this" questions |
| `show-me-your-work`, `principle-*` | Principles the skills above reference by name |

Not included: the plugin's SessionStart hook (no automatic routing — skills run only when invoked),
its agents, and skills unrelated to this repo (video, formal verification, statecharts, etc.).

No `pstack-models.md` override sheet is checked in, so each skill uses the model defaults written in
its own `Models` section.

## Updating

Copy the same folders from `plugins/pstack/skills/` of a newer pstack-claude commit over these,
and update the source commit above. Do not edit the skill files in place; keep local rules in
`ts/docs/dev/` instead.
