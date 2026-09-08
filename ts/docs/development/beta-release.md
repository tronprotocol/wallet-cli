# TypeScript CLI beta release

Release the TypeScript npm package as `@tron-walletcli/wallet-cli@4.14.0-beta.1` with the `beta` dist-tag. Keep the stable `latest` tag unchanged. The standalone Actions workflow builds downloadable artifacts; it does not publish the npm package automatically.

## Prepare

Use a clean checkout of the reviewed commit and Node.js 22. The package uses an explicit public-document allowlist; internal development and API reports are excluded. Run `npm run verify:package` to check the packed files and independently installed executable.

Run from `ts/`:

```sh
npm version 4.14.0-beta.1 --no-git-tag-version
npm ci
npm run typecheck
npm run lint
npm run format:check
npm run depcruise
npm test -- --maxWorkers=4
npm run build
npm run verify:package
npm pack
```

The CLI version comes from `package.json`. The x402 core, TRON, EVM and fetch packages are build dependencies compiled into the CLI bundle, preserving the tested SDK implementations. Root-only npm overrides are insufficient for consumer installations.

## Validate the actual tarball

Install the generated tarball into a fresh directory outside the repository:

```sh
npm init -y
npm install /absolute/path/to/tron-walletcli-wallet-cli-4.14.0-beta.1.tgz
./node_modules/.bin/wallet-cli --version
./node_modules/.bin/wallet-cli --help
```

Require CLI version `4.14.0-beta.1`. Verify TRON `2.0.0-beta.1` and core `1.1.1-beta.1` in the build checkout with `npm ls @bankofai/x402-core @bankofai/x402-tron`; the installed CLI must not import external x402 packages. Verify the installed entry point with mocked provider challenges on Base/BSC/TRON/Nile, BAI summary and rejection of Nile recharge, and 8004 reads and dry-run/build-only transactions.

From the build checkout, run the artifact checks against that installed executable:

```sh
WALLET_CLI_TEST_ENTRY=/absolute/path/to/node_modules/@tron-walletcli/wallet-cli/dist/index.js \
  npx vitest run test/x402-provider-payment.test.ts test/bai-nile-compatibility.test.ts test/erc8004.test.ts test/beta-artifact-signing.test.ts --maxWorkers=4
```

These checks include real signing with a temporary encrypted wallet and simulated HTTP responses, without broadcasting a transaction.

Before claiming production readiness, separately verify real chain receipts, Permit2 allowance requirements, BAI self/recipient credit attribution and duplicate transaction reporting with the backend. Offline settlement tests simulate broadcast and receipts; they do not establish actual chain execution. Physical Ledger verification remains a separate check.

## Publish the verified artifact

Use an npm account with write permission for this package. Publish the exact tested tarball:

```sh
npm whoami
npm publish /absolute/path/to/tron-walletcli-wallet-cli-4.14.0-beta.1.tgz --tag beta --access public
npm view @tron-walletcli/wallet-cli dist-tags --json
```

Record the source commit, tarball SHA-256 and validation results. After publishing, confirm installation from the registry:

```sh
npm install -g @tron-walletcli/wallet-cli@4.14.0-beta.1
wallet-cli --version
```

A subsequent beta must use a new version, such as `4.14.0-beta.2`. Publish standalone archives separately after the platform workflow succeeds, and mark their GitHub release as a prerelease.
