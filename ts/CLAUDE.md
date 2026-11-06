# TypeScript agent instructions

Read [the repository instructions](../CLAUDE.md) for build commands and the shared Graphify workflow.
Before changing files here, read every file in [docs/dev/rules/](docs/dev/rules/).

## Graphify

Follow the [Graphify refresh requirements](../CLAUDE.md#graphify) when modifying code or tests here.
From `ts/`, use:

```bash
bash ../scripts/graphify.sh query "MessageSigner" --budget 1200
bash ../scripts/graphify.sh explain TxPipeline
bash ../scripts/graphify.sh refresh
```

The wrapper uses the shared repository graph at `../graphify-out/`.
