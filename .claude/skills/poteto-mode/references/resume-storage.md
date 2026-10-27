# Resume storage

Pause and pickup share one project locator. The `resume.mjs` command under `skills/poteto-mode/scripts/` resolves the project's Git common directory and stores checkpoints under its `pstack/resume/` directory. `latest.json` points to the latest complete checkpoint and records the worktree, branch, timestamp, note, and requested artifacts with content hashes.

Claude Code, Codex, and other runtimes use this same command and location. Runtime-specific home directories and transcript encodings do not affect lookup. Git worktrees of the same repository share the locator, and Git excludes its contents from commits. This requires a local Git checkout whose common directory survives the interruption. It does not survive deleting or recloning the repository; transfer the complete checkpoint to durable storage before that happens and give the resumed session its locator.

## Write a checkpoint

1. Run `node <scripts>/resume.mjs begin --project <worktree>` to allocate a new checkpoint directory. Write `resume.md` there with intent, verified progress, current state, and next steps.
2. Save requested artifacts in that directory and link them from the note. Reuse existing artifacts in the project when their location survives the anticipated interruption. Do not make competing copies. For a worktree that will be removed, place the requested material in the common checkpoint store instead. Check exact wording, completeness, and order where required.
3. Publish with `node <scripts>/resume.mjs publish --project <worktree> --note <resume.md> --artifact <file> ...`. Register every local note link as an artifact, including existing project files. Link each local file with an inline Markdown link whose destination is the path, written bare or as `<path>`, with no square brackets in the link text and no title after the path. Reference-style links are not read. The path is relative to the note or absolute, and it is percent-decoded, so write a literal `%` as `%25`. Wrap a path that contains spaces or parentheses in angle brackets, or percent-encode it. Links inside code spans and fenced code blocks are ignored. Each rejected link reports this rule. The command verifies file ownership, links, and contents before atomically replacing `latest.json`. A failed publication must not be treated as a ready checkpoint.
4. Run `node <scripts>/resume.mjs read --project <worktree>` and open its note and artifacts. Treat published checkpoint files as immutable. Use a new checkpoint directory for a later pause. If an existing project artifact changes, pickup reports that difference rather than silently treating it as the saved material.

`begin` separates concurrent writers' files. Publishing replaces one shared latest pointer atomically; the last complete publication wins. Keep the returned checkpoint paths when multiple tasks must remain separately resumable. The pointer is a locator, not a task scheduler or execution lock.

## Read a checkpoint

Session pickup starts with `node <scripts>/resume.mjs read --project <worktree>` using only the project directory. Exit 0 with `kind: checkpoint` provides the saved note and all registered artifacts. Open them before searching transcripts. The command validates hashes and links again, including reuse of project artifacts.

Exit 2 with `kind: missing` means there is no pointer, so use the transcript, cloud URL, or branch fallback. Exit 1 with `kind: unavailable` means a checkpoint is malformed, unreadable, changed, or incomplete. Diagnose that concrete gap; do not silently ignore the checkpoint or claim the material was never saved. None of these commands causes a running task to pause.
