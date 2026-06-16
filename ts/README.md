# wallet-cli (TypeScript)

A TRON + EVM **standard CLI** wallet — a TypeScript rewrite of the Java wallet-cli's
standard (AI-agent-friendly) mode. Built strictly bottom-up per the
[module-layered plan](../docs/typescript-wallet-cli-module-layered-plan.zh-TW.md).

Standard CLI only: stable JSON envelope, `0/1/2` exit codes, strict stdout/stderr
discipline, wallet-centric encrypted keystore, env/stdin auth (no secrets in argv).

## Quick start

```bash
pnpm install
pnpm test          # unit + golden CLI tests
pnpm run build     # → dist/index.js (executable)
pnpm dev -- --help # run from source via tsx

# examples (WALLET_CLI_HOME isolates state; MASTER_PASSWORD unlocks the keystore)
export WALLET_CLI_HOME=$(mktemp -d) MASTER_PASSWORD=secretpwA
echo "$MNEMONIC" | pnpm dev -- wallet import --type seed --mnemonic-stdin --label main
pnpm dev -- --output json wallet list
pnpm dev -- --output json evm message sign --message "hello world"
pnpm dev -- --output json capabilities --network nile
```

Grammar (plan decision **B**): `wallet-cli <family> <resource> <action> --network <net> [flags]`
for chain-bound commands; `wallet`/`config`/`chains`/`capabilities` are neutral. Global
flags are accepted on either side of the command (kubectl-style).

## Architecture (strict dependency layers — depend only downward)

| Layer | Modules | Dir |
|------|---------|-----|
| 5 entry | Runner | `src/runner` `src/index.ts` |
| 4 shell+cmds | CliShell · HelpService · TronModule · EvmModule · neutral group | `src/cli` `src/help` `src/modules/{tron,evm,neutral,shared}.ts` |
| 3 routing | CommandRegistry · CapabilityGate · TxPipeline | `src/registry` `src/capability` `src/pipeline` |
| 2 services | ExecutionContext · SignerResolver · ChainCore · OutputFormatter · ZodYargsAdapter | `src/context` `src/signer` `src/chain` `src/output` `src/adapter` |
| 1 base | Contract · Keystore · Config/NetworkRegistry · SecretResolver · RpcClient · Ledger | `src/contract` `src/keystore` `src/config` `src/secret` `src/rpc` `src/ledger` |
| 0 leaf | SharedTypes · Errors · CryptoEnvelope · Derivation · AddressCodec · AtomicFileStore · StreamManager | `src/types` `src/errors` `src/crypto` `src/derivation` `src/address` `src/fs` `src/stream` |

- **yargs** owns tokenizing/routing; **zod** owns validation/types/help/agent-schema
  (one zod per command, no drift); custom Output/Stream/Errors own output + exit.
- The shell never imports command modules — they self-register into `CommandRegistry`
  (dependency inversion: shell = host, commands = plugins).

## Scope of this milestone

Full architecture (all 6 layers wired) + the complete neutral `wallet`/`config`/`chains`/
`capabilities` surface, plus **3 symbolic chain commands per family**: `account balance`
(read), `tx send-native` (full TxPipeline), `message sign` (direct SignerResolver). The
broad TRON/EVM command inventory is intentionally not yet implemented.

### Known limitations (deliberate, documented)

- **Ledger**: the `Signer`/`LedgerSigner` contract and routing exist, but the HID transport
  is stubbed (it throws `auth_required`). Native `@ledgerhq/*` deps are added in the last
  milestone (plan §7.15.11).
- **Live tx**: `tx send-native` build/broadcast use real RPC (viem/tronweb) but are only
  smoke-tested, not part of CI golden tests (which avoid live nodes).
- **BIP39 passphrase** is fully supported: the passphrase is persisted *inside* the encrypted
  vault so the signing seed always matches the displayed address.
