# CLI regression tests

From `ts/`:

```sh
npm run test:unit                       # in-process unit tests
npm run test:golden                     # all black-box CLI tests
npm run test:golden -- test/golden.test.ts
npm run test:golden -- -t 'startup migration'
npm test                               # both projects
```

Golden tests build the CLI once and start a fresh process per invocation. A supplied
`WALLET_CLI_TEST_ENTRY` selects an independently built or installed artifact and skips the
local build; callers must ensure that artifact is current.

Each Vitest invocation uses at most ten unit workers, leaving one available CPU core free
(with a minimum of one worker). Remaining test files wait for a free worker. The golden
project keeps its lower limit of four workers because each worker also starts a full CLI
process, and wallet operations run the production password KDF. `npm test` runs unit and golden projects in
sequence, so their worker pools do not overlap.

These limits apply to test workers in a single Vitest invocation. They do not include the
coordinator, CLI or fixture subprocesses, or workers from other terminals or agents. Run
one test invocation at a time to avoid multiplying resource use. To reduce concurrency on a
memory-constrained machine, use `VITEST_MAX_WORKERS=2 npm test` (or `npm run test:unit` /
`npm run test:golden`). This overrides both project limits; keep the value at or below ten.
The root `--maxWorkers` flag does not override these explicit project settings in Vitest 4.

The main golden suite uses a shared harness that creates an encrypted seed fixture once
per label, then copies it
into a separate temporary wallet directory for every test. Commands still perform real
password derivation, decryption, migration, and signing. Each test's copy and the seed
fixture are removed after use.

A full local run with fixture reuse and the worker cap took 281 seconds, versus 313 seconds
before the change (411 cases in both runs). Splitting the main suite increased runtime
on the measured machine, so that experiment was not retained. Network-dependent tests
can still vary with RPC availability.
