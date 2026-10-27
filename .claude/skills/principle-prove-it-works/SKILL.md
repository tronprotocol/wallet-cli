---
name: principle-prove-it-works
description: "Apply after completing a task, before declaring done. Verify against the real artifact (run the feature, read the actual value, inspect the diff), not a proxy, self-report, or 'it compiles.'"
user-invocable: false
---

# Prove It Works

Verify every task output by checking the real thing directly. Do not infer from proxies, self-reports, or "it compiles."

**Why:** Unverified work has unknown correctness. Indirect verification (file mtimes, output freshness, agent self-reports, cached screenshots) feels cheaper than direct observation. Acting on a wrong inference costs far more than checking the source.

Check the real thing, not a proxy:
- Check process liveness directly, not indirectly through derived state
- Read the actual value, not a cached or derived representation
- When verification fails, suspect the observation method before suspecting the system
- Before you report success (merged, sent, started), read the real state and the exit code. Truncated output (`| tail -1`) and your own echo prove nothing

Verify the process as well as the outcome. A correct result can rest on a broken process, and a review that checks results passes it: a clause reconstructed from the user's paste instead of the durable record, a constraint honored by chance from a file never read. For each fact you relied on, name the record it came from and confirm that record is the one the project's rules point at.

Red is a colour, not a measurement. A failing check proves the instrument only when the failure content is the disagreement you predicted. An exception, an empty collection against a non-empty literal, and a real mismatch all print red, so quote the assertion's diff (`Extra items in the right set`), never the assertion (`assert {...} == {...}`). A convergence probe keys on behavior only the new artifact can produce, never an identity field the old one also emits. A same-SHA restart lets old code report the new commit SHA.

## Script the check when you can

The strongest proof is a deterministic script that re-runs the same comparison, not a one-time eyeball. Write the script, run it, and keep its output as an artifact a reviewer can re-run instead of trusting your word.

Keep the artifact visible for the human. Commit it only for large or complex work where the trail has to be auditable later, like a big port or migration (the **show-me-your-work** skill).
