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

The golden project uses at most four workers because each worker also starts a full CLI
process, and wallet operations run the production password KDF. Override with Vitest's
`--maxWorkers` flag when measuring a different machine.

The main golden suite uses a shared harness that creates an encrypted seed fixture once
per label, then copies it
into a separate temporary wallet directory for every test. Commands still perform real
password derivation, decryption, migration, and signing. Each test's copy and the seed
fixture are removed after use.

A full local run with fixture reuse and the worker cap took 281 seconds, versus 313 seconds
before the change (411 cases in both runs). Splitting the main suite increased runtime
on the measured machine, so that experiment was not retained. Network-dependent tests
can still vary with RPC availability.
