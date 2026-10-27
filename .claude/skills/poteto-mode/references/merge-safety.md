# Merge and restack safety

Use this reference with [Shipping](../playbooks/shipping.md) and before topology changes in [Autopilot-stack](../playbooks/autopilot-stack.md). Keep the existing watcher responsible for CI and blocker classification. These operations add revision and destination checks; they do not grant merge authority.

## Read both pending mechanisms

Use `ship-pr` under the installed plugin's `skills/poteto-mode/scripts/watch-pr/` directory. It owns GitHub transport, parsing, cancellation order, and readback. The watcher and this command share one `LandingRevision` containing the repository, PR number, head OID, base branch, and base OID.

```sh
ship-pr inspect --repo "$owner/$repo" --pr "$pr" > "$record_file"
ship-pr cancel-pending --record "$record_file"
```

Run the installed command by its full path when it is not on PATH. Inspect emits `kind: inspected` with a parsed landing record, including both pending mechanisms and the merge commit when present. Save that record with the verification evidence. Cancellation accepts the saved record, rereads current state, disables auto-merge when present, rereads queue membership, dequeues when needed, and verifies both mechanisms are absent on the same open landing revision. It does not merge, push, retarget, or grant landing authority.

Only exit 0 with `kind: cancelled` permits the planned topology operation. `changed`, `not-open`, and `still-pending` return exit 1 with the observed record. `unavailable` returns exit 1 with the read or mutation failure. Missing fields and unsupported APIs never mean an absent request. Reconcile those outcomes before rewriting; do not replace the saved record merely to bypass a mismatch.

Establish the affected dependency chain and coordinate its topology writer first. Inspect and cancel each affected PR, including descendants whose context will change; leave unrelated PRs alone. Cancellation is an observed condition, not a lock against another actor rearming afterward. If state changes, stop and reconcile. Origin must supply an equivalent validated operation through its installed service; this command is GitHub-specific and must not be presented as Origin support.

## Preserve concurrent writes and child changes

Capture the remote branch SHA before rewriting with `git ls-remote --exit-code origin "refs/heads/$branch"`, and validate that exactly the intended ref was returned. Keep that SHA in the operation record. An implicit lease or a prior read alone is insufficient; a background fetch can move a tracking ref.

After confirming the parent squash landed in the intended destination, fetch trunk and identify the recorded old parent tip on which this child was built. Verify it is an ancestor of the child and inspect `old-parent..child` to confirm the range contains only child work. If it does not, reconstruct the boundary before proceeding. Never infer it from the parent's new squash commit.

```sh
git merge-base --is-ancestor "$old_parent_tip" "$child"
git rebase --onto "$trunk_tip" "$old_parent_tip" "$child"
git push --force-with-lease="refs/heads/$child:$captured_remote_head" \
  origin "HEAD:refs/heads/$child"
```

Run the rebase in the child's clean worktree, where `HEAD` is the prepared child. This excludes the parent's old commits. Inspect the resulting diff and content, reassess review applicability, and run checks at the new head. If the lease refuses the push, fetch and reconcile the concurrent work; do not refresh the lease and retry the overwrite blindly. Retarget only after cancellation has been verified. Keep the recorded boundary for each remaining child when preparing later levels.

## What the service guards

GitHub's immediate merge head condition is `--match-head-commit` in `gh`, `expectedHeadOid` in GraphQL `mergePullRequest`, or `sha` in the REST merge endpoint. Use one, carrying the exact verified SHA. None of these supplies an expected base-branch condition. Observe the base immediately before and after and coordinate retargeting; do not call those observations atomic.

A queue or automatic request may outlive its admission revision. Use it only when existing repository rules enforce the required verification for the eventual revision and merge context. A prose verdict or a green check on an older head is not such a gate. If those guarantees cannot be established, keep watching for an immediate guarded merge. If the repository requires a queue, stop at that unmet gate rather than bypassing protection.

After a merge, confirm state `MERGED`, the approved final head, the intended base, and a non-null merge commit. Fetch the destination and run `git merge-base --is-ancestor "$merge_commit" "$destination_tip"`; then check resulting content before advancing. If the service cannot report the relevant facts, the outcome remains unconfirmed.

Service references: [GitHub CLI merge flags](https://cli.github.com/manual/gh_pr_merge), [GraphQL pull requests and queue mutations](https://docs.github.com/en/graphql/reference/pulls), and [REST merge endpoint](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request). Recheck installed service capabilities when these differ. Test service behavior in a disposable repository, never with production PRs.
