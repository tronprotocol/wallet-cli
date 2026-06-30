import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(root, "dist/index.js");
const expectScript = join(root, "scripts/import-wallet.exp");
const privateEnvPath = resolve(root, "../ts/.private/.env.test");
const baselinePath = join(root, "docs/baselines/nile-full-command-test-2026-06-29-run2-rawlogs.md");
const reportPath = join(root, "docs/nile-full-command-test-2026-06-29-run2-rawlogs.md");
const walletHome = mkdtempSync(join(tmpdir(), "wallet-cli-refactor-nile-"));
const password = `Aa1!${randomBytes(12).toString("hex")}`;

const fixtures = parseEnv(readFileSync(privateEnvPath, "utf8"));
const privateKey = required(fixtures, "TEST_TRON_PRIVATE_KEY");
const mnemonic = required(fixtures, "TEST_TRON_MNEMONIC");
const USDT = process.env.TEST_TRC20_CONTRACT ?? "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const TRC10 = process.env.TEST_TRC10_ASSET_ID ?? "1005416";
const WATCH_ADDRESS = process.env.TEST_WATCH_ADDRESS ?? "TEWBqkD8YMn8FbZjzQifQhQLHiYjcT2zvG";
const FIXED_BLOCK = process.env.TEST_TRON_BLOCK ?? "68723818";

const baseEnv = {
  ...process.env,
  NO_COLOR: "1",
  WALLET_CLI_HOME: walletHome,
};

const sections = [];
const stats = { total: 0, exit0: 0, exit1: 0, exit2: 0, other: 0 };

function parseEnv(raw) {
  return Object.fromEntries(raw.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return [];
    const at = trimmed.indexOf("=");
    if (at < 1) return [];
    const value = trimmed.slice(at + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    return [[trimmed.slice(0, at).trim(), value]];
  }));
}

function required(values, key) {
  const value = values[key];
  if (!value) throw new Error(`missing ${key} in ${privateEnvPath}`);
  return value;
}

function shellDisplay(args, inputLabel) {
  const quoted = args.map((value) => /[\s'"(){}[\]]/.test(value)
    ? `'${value.replaceAll("'", "'\\''")}'`
    : value);
  return `${inputLabel ? `${inputLabel} | ` : ""}wallet-cli ${quoted.join(" ")}`;
}

function record(display, result) {
  const status = result.status ?? 1;
  stats.total++;
  if (status === 0) stats.exit0++;
  else if (status === 1) stats.exit1++;
  else if (status === 2) stats.exit2++;
  else stats.other++;
  const output = `${result.stderr ?? ""}${result.stdout ?? ""}`.replace(/\n$/, "");
  sections.push(`\n\`\`\`\n$ ${display}\n${output}${output ? "\n" : ""}# exit=${status}\n\`\`\`\n`);
}

function run(args, options = {}) {
  const result = spawnSync("node", [entry, ...args], {
    encoding: "utf8",
    env: baseEnv,
    input: options.input,
    timeout: options.timeout ?? 90_000,
  });
  if (result.error) throw result.error;
  if (options.record !== false) {
    record(options.display ?? shellDisplay(args, options.inputLabel), result);
  }
  return result;
}

function runJson(args, options = {}) {
  const result = run(["-o", "json", ...args], options);
  try {
    return { result, envelope: JSON.parse(result.stdout) };
  } catch {
    throw new Error(`expected JSON from: ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  }
}

function runPassword(args, options = {}) {
  return run([...args, "--password-stdin"], {
    ...options,
    input: `${options.password ?? password}\n`,
    inputLabel: options.inputLabel ?? "printf <password>",
  });
}

function runInteractive(kind, label, secret) {
  const result = spawnSync("expect", [expectScript], {
    encoding: "utf8",
    env: {
      ...baseEnv,
      CLI_ENTRY: entry,
      IMPORT_KIND: kind,
      IMPORT_LABEL: label,
      TEST_MASTER_PASSWORD: password,
      TEST_IMPORT_SECRET: secret,
    },
    timeout: 90_000,
  });
  if (result.error) throw result.error;
  record(`pty: wallet-cli import ${kind} --label ${label}`, result);
  return result;
}

function heading(title) {
  sections.push(`\n## ${title}\n`);
}

function txId(envelope) {
  return envelope?.data?.txId ?? envelope?.data?.hash;
}

async function waitForConfirmation(id) {
  if (!id) return;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const { envelope } = runJson(["tx", "status", "--txid", id], { record: false });
    if (envelope?.data?.confirmed) return;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

function assertSuccess(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label} failed with ${result.status}\n${result.stdout}\n${result.stderr}`);
  }
}

mkdirSync(dirname(reportPath), { recursive: true });
sections.push(
  "# wallet-cli refactor — full live command test on Nile — RAW LOGS\n",
  `\nGenerated: ${new Date().toISOString()}  \n`,
  "Network: `tron:nile`  \n",
  "Wallet home: isolated temporary directory  \n",
  "Secrets: loaded from `../ts/.private/.env.test`, never printed or copied.\n",
);

heading("0. Help surface (raw-log-derived groups and leaves)");
const baselineHelp = readFileSync(baselinePath, "utf8").split("## 1. Wallet & account management")[0];
const helpCommands = [...baselineHelp.matchAll(/^\$ wallet-cli (.*--help)$/gm)]
  .map((match) => match[1].trim());
for (const command of helpCommands) run(command.split(/\s+/));

heading("1. Wallet and account management");
assertSuccess(runInteractive("private-key", "funded", privateKey), "private-key import");
assertSuccess(run(["config", "defaultNetwork", "nile"]), "default network");
assertSuccess(runPassword(["create", "--label", "recipient"]), "recipient create");
const recipient2 = runJson(["create", "--label", "recipient2", "--password-stdin"], {
  input: `${password}\n`,
  inputLabel: "printf <password>",
});
assertSuccess(recipient2.result, "recipient2 create");
assertSuccess(runInteractive("mnemonic", "funded-again", mnemonic), "mnemonic import");
assertSuccess(run(["import", "watch", "--address", WATCH_ADDRESS, "--label", "watched"]), "watch import");
run(["list"]);
const listed = runJson(["list"]);
const funded = listed.envelope.data.find((account) => account.label === "funded");
const recipient = listed.envelope.data.find((account) => account.label === "recipient");
if (!funded?.addresses?.tron || !recipient?.addresses?.tron) throw new Error("missing funded/recipient account");
const fundedAddress = funded.addresses.tron;
const recipientAddress = recipient.addresses.tron;
run(["current"]);
run(["use", "recipient"]);
run(["current"]);
run(["use", "funded"]);
run(["rename", "recipient", "--label", "recipient"]);
runPassword(["derive", "--account", "recipient"]);
runPassword(["-o", "json", "derive", "--account", "recipient", "--index", "5"]);
const backupPath = join(walletHome, "backup.json");
runPassword(["backup", "recipient2", "--out", backupPath]);
run(["delete", "recipient2", "--yes"]);
run(["networks"]);
runJson(["networks"]);
run(["config"]);
run(["config", "defaultNetwork"]);
runJson(["config"]);

heading("2. Account queries");
run(["account", "balance"]);
run(["account", "balance", "--network", "nile"]);
run(["account", "balance", "--network", "shasta"]);
run(["account", "balance", "--network", "tron:nile"]);
runJson(["account", "balance"]);
run(["account", "balance", "--account", "recipient"]);
run(["account", "balance", "--account", fundedAddress]);
run(["account", "info"]);
runJson(["account", "info"]);
run(["account", "portfolio"]);
runJson(["account", "portfolio"]);
run(["account", "history", "--limit", "5"]);
runJson(["account", "history", "--limit", "3"]);

heading("3. Token commands");
run(["token", "list"]);
runJson(["token", "list"]);
run(["token", "info", "--contract", USDT]);
runJson(["token", "info", "--contract", USDT]);
run(["token", "info", "--asset-id", TRC10]);
run(["token", "balance", "--contract", USDT]);
runJson(["token", "balance", "--contract", USDT]);
run(["token", "balance", "--asset-id", TRC10]);
run(["token", "add", "--contract", USDT]);
run(["token", "list"]);
runJson(["token", "list"]);

heading("4. Transactions");
runPassword(["tx", "send", "--to", recipientAddress, "--amount", "1", "--dry-run"]);
runPassword(["-o", "json", "tx", "send", "--to", recipientAddress, "--amount", "1", "--dry-run"]);
const signed = runJson(["tx", "send", "--to", recipientAddress, "--amount", "1", "--sign-only", "--password-stdin"], {
  input: `${password}\n`,
  inputLabel: "printf <password>",
});
assertSuccess(signed.result, "sign-only transfer");
const broadcast = runJson(["tx", "broadcast", "--tx-stdin"], {
  input: `${JSON.stringify(signed.envelope.data.signed)}\n`,
  inputLabel: "printf <signed-transaction>",
});
const liveTrx = runJson(["tx", "send", "--to", recipientAddress, "--amount", "1", "--password-stdin"], {
  input: `${password}\n`,
  inputLabel: "printf <password>",
});
runPassword(["tx", "send", "--to", recipientAddress, "--contract", USDT, "--amount", "0.001", "--dry-run"]);
const liveUsdt = runJson(["tx", "send", "--to", recipientAddress, "--contract", USDT, "--amount", "0.001", "--password-stdin"], {
  input: `${password}\n`,
  inputLabel: "printf <password>",
});
runPassword(["tx", "send", "--to", recipientAddress, "--asset-id", TRC10, "--amount", "1", "--dry-run"]);
const liveTrc10 = runJson(["tx", "send", "--to", recipientAddress, "--asset-id", TRC10, "--amount", "1", "--password-stdin"], {
  input: `${password}\n`,
  inputLabel: "printf <password>",
});
const trxId = txId(liveTrx.envelope);
const usdtId = txId(liveUsdt.envelope);
await waitForConfirmation(trxId);
await waitForConfirmation(usdtId);
await waitForConfirmation(txId(liveTrc10.envelope));
await waitForConfirmation(txId(broadcast.envelope));
run(["tx", "status", "--txid", trxId]);
runJson(["tx", "status", "--txid", trxId]);
run(["tx", "info", "--txid", trxId]);
runJson(["tx", "info", "--txid", usdtId]);

heading("5. Contracts");
run(["contract", "info", "--contract", USDT]);
runJson(["contract", "info", "--contract", USDT]);
const balanceParams = JSON.stringify([{ type: "address", value: fundedAddress }]);
run(["contract", "call", "--contract", USDT, "--method", "balanceOf(address)", "--params", balanceParams]);
runJson(["contract", "call", "--contract", USDT, "--method", "balanceOf(address)", "--params", balanceParams]);
runJson(["contract", "call", "--contract", USDT, "--method", "decimals()"]);

heading("6. Stake and message signing");
runPassword(["stake", "freeze", "--amount-sun", "1000000", "--resource", "energy"]);
runPassword(["stake", "freeze", "--amount-sun", "1000000", "--resource", "bandwidth", "--dry-run"]);
runPassword(["stake", "delegate", "--amount-sun", "1000000", "--receiver", recipientAddress, "--resource", "energy", "--dry-run"]);
runPassword(["stake", "undelegate", "--amount-sun", "1000000", "--receiver", recipientAddress, "--resource", "energy", "--dry-run"]);
runPassword(["stake", "unfreeze", "--amount-sun", "1000000", "--resource", "energy", "--dry-run"]);
runPassword(["stake", "withdraw"]);
runPassword(["stake", "cancel-unfreeze", "--dry-run"]);
runPassword(["message", "sign", "--message", "hello tron"]);
runPassword(["-o", "json", "message", "sign", "--message", "hello tron"]);

heading("7. Blocks");
run(["block"]);
runJson(["block"]);
run(["block", "--number", FIXED_BLOCK]);
run(["block", FIXED_BLOCK]);

heading("8. Error and exit-code surface");
run(["--version"]);
run(["frobnicate"]);
run(["account", "resources"]);
run(["stake", "prices"]);
run(["account", "balance", "--network", "mainnet-eth"]);
run(["account", "balance", "--network", "ethereum"]);
runJson(["account", "balance", "--network", "bogus"]);
run(["import", "ledger", "--app", "ethereum", "--label", "l"]);
runPassword(["tx", "send", "--amount", "1"]);
runPassword(["tx", "send", "--to", "GARBAGE", "--amount", "1"]);
runPassword(["tx", "send", "--to", recipientAddress, "--amount", "1", "--raw-amount", "1000000"]);
runPassword(["tx", "send", "--to", recipientAddress, "--amount", "1", "--dry-run"], {
  password: "Wrong1!Password",
});
const unknownTx = "00".repeat(32);
run(["tx", "status", "--txid", unknownTx]);
runJson(["tx", "info", "--txid", unknownTx]);
run(["account", "balance", "--account", "no-such-wallet"]);
runPassword(["tx", "send", "--account", "watched", "--to", recipientAddress, "--amount", "1"]);
runPassword(["tx", "send", "--to", recipientAddress, "--amount", "1", "--sign-only"], {
  password: "Wrong1!Password",
});

sections.push(
  `\n## Summary\n\nInvocations: ${stats.total}; exit 0: ${stats.exit0}; exit 1: ${stats.exit1}; exit 2: ${stats.exit2}; other: ${stats.other}.\n`,
);
writeFileSync(reportPath, sections.join(""));
process.stdout.write(`Nile live suite complete: ${reportPath}\n`);
process.stdout.write(`invocations=${stats.total} exit0=${stats.exit0} exit1=${stats.exit1} exit2=${stats.exit2} other=${stats.other}\n`);

