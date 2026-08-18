/**
 * Spawn options every black-box CLI test must use, or the suite hangs on a developer machine.
 *
 * The CLI decides whether it MAY prompt by probing /dev/tty (`TtyBackend`), not by inspecting
 * stdin — prompts are written to and read from the terminal directly so they can never pollute a
 * piped result envelope. A child inherits its parent's controlling terminal even when all three
 * stdio streams are pipes, so on a workstation any command that leaves a promptable field off argv
 * hits gap-fill, writes `? Label …` to /dev/tty and waits forever: the piped stdin cannot answer
 * it. CI has no controlling terminal, so the very same suite passes there — a local-only hang.
 *
 * `detached` makes the child a session leader (setsid), which drops the controlling terminal and
 * reproduces the CI condition exactly. spawnSync honors it at runtime but @types/node declares it
 * only for spawn(), hence the `as SpawnSyncOptionsWithStringEncoding` at the call sites. The
 * failure mode is safe: if a future Node stopped honoring it, the hang comes back as a loud spawn
 * timeout — it cannot silently turn into a passing test.
 */
export const DETACHED = { detached: true } as const;
