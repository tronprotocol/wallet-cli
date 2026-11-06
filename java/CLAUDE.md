# Java agent instructions

Read [the repository instructions](../CLAUDE.md) for build commands and the shared Graphify workflow.

## Graphify

Follow the [Graphify refresh requirements](../CLAUDE.md#graphify) when modifying code or tests here.
From `java/`, use:

```bash
bash ../scripts/graphify.sh query "WalletApiWrapper" --budget 1200
bash ../scripts/graphify.sh explain WalletApi
bash ../scripts/graphify.sh refresh
```

The wrapper uses the shared repository graph at `../graphify-out/`.
