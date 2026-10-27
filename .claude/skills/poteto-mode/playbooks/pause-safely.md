### Pause safely

**You own a clean stop. Leave a checkpoint a cold-start agent can resume from.** This is explicit only. On "keep going", "going to bed, keep going", or "don't stop", do not pause.

1. Stop at a safe boundary. Finish the current atomic step or back out of it. Start nothing new, and cancel any nested subagents.
2. Take no irreversible action to pause. No PR and no push unless you already had one out.
3. Make the work durable. Commit uncommitted edits as one clear `wip:` commit on the current branch so nothing is lost. If the tree is broken, say so in the commit body in one line.
4. Write the resume note off-context. Capture intent, what you were doing, progress and what's verified, current state, next steps, key files, and gotchas. Use the canonical checkpoint directory from [Resume storage](../references/resume-storage.md), which defines the shared writer/reader locator for every runtime. It must survive the expected interruption. If a show-me-your-work trail exists, point at it instead of duplicating it.
5. Preserve artifacts the user explicitly requested for use after resume, such as questions, an acceptance checklist, or a procedure. Reuse the existing artifact when there is one; otherwise save the requested material beside the resume note and link it. Preserve exact wording, completeness, and order when requested. Publish the checkpoint through `resume.mjs`, which verifies links and files before atomically updating the project pointer. Then read it using only the project directory and check the requested contents before declaring the checkpoint ready. Ten requested questions means all ten are reachable from the note alone. This does not require archiving every aside or pausing an ongoing task.

**Reply:** where you are in the loop, what's on disk versus still in your head (paths, no diff dumps), the commits you made and whether the tree is clean, and the first action on resume. This is a pause, not a final report.
