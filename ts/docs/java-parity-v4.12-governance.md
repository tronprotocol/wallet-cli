# v4.12 治理功能 Java / TypeScript 一致性核对

结论：本次 12 条 TS 命令与 Java wallet-cli 使用相同的 TRON protocol contract、字段方向和 int64 编码；TS 仅在命令形态、前置校验和输出结构上做了需求文档指定的增强。

## 命令与协议映射

| TS 命令 | Java 命令 / 方法 | Protocol contract / 算法 | 一致性要点 |
|---|---|---|---|
| `proposal list` | `ListProposals`, `ListProposalsPaginated` | `Proposal` | 相同七个 proto 字段；TS 合并分页并增加本地状态筛选 |
| `proposal show` | `GetProposal` | `Proposal` | `PENDING/DISAPPROVED/APPROVED/CANCELED` 逐项映射 |
| `proposal create` | `createProposal` | `ProposalCreateContract` | `owner_address` 与 `map<int64,int64> parameters` 相同；TS 支持参数名并精确编码完整 Java `long` 范围 |
| `proposal approve` | `approveProposal` | `ProposalApproveContract` | 默认 `is_add_approval=true`；`--cancel` 为 `false`，没有“反对票” |
| `proposal delete` | `deleteProposal` | `ProposalDeleteContract` | 相同 `proposal_id`；只允许发起人在窗口内撤销 |
| `witness create` | `CreateWitness` | `WitnessCreateContract` | 业务字段只有 `url`；费用读取 `getAccountUpgradeCost` |
| `witness update` | `updateWitness` | `WitnessUpdateContract` | `update_url` 内容与 Java URL 输入一致 |
| `witness set-brokerage` | `updateBrokerage` | `UpdateBrokerageContract` | 0–100 原值透传，含义均为 SR 留存比例 |
| `contract clear-abi` | `clearContractABI` | `ClearABIContract` | `owner_address` / `contract_address` 相同 |
| `contract set-origin-energy-limit` | `updateEnergyLimit` | `UpdateEnergyLimitContract` | 正整数原值透传；绕开 TronWeb 6.4.0 过时的 10,000,000 本地上限 |
| `contract set-user-resource-percent` | `updateSetting` | `UpdateSettingContract` | 0=部署者承担，100=调用者承担；不反转 |
| `contract create2` | `create2` | 本地 Keccak/Base58Check | deployer 21 字节、salt 低 8 字节、无 `0xff`，逐字节一致 |

## TS 的安全增强

- 写操作在构建前校验 witness、提案状态/所有权、合约 `origin_address`、账户激活状态和注册费余额；Java 多数情况交给节点拒绝。
- `proposal create` 对参数名、布尔值和已知范围做本地校验。int64 值不经过 JS 浮点数：专用 protobuf 编码器生成 `ProposalCreateContract`，签名前再从 JSON 精确重编码并与 `raw_data_hex` 比对。
- `set-origin-energy-limit` 按链上规则拒绝 0；Java 旧入口只检查 `< 0`，会让 0 进入节点后再失败。
- 三类写操作统一支持 `--dry-run`、`--sign-only`、`--build-only`、`--expiration`、`--permission-id` 和 `--wait`。`--build-only` 不解析私钥或硬件 signer，可直接交给后续多签流程。
- 所有构建结果限制为单一预期 contract type；软件签名与 Ledger 签名前同时校验 `txID = sha256(raw_data_hex)`、protobuf contract type 和 raw-data 重编码一致性。

## 核对源

- Java 命令层：`../java/src/main/java/org/tron/walletcli/cli/commands/ProposalCommands.java`、`WitnessCommands.java`、`ContractCommands.java`
- Java 旧入口与参数校验：`../java/src/main/java/org/tron/walletcli/Client.java`
- Java protocol 构建：`../java/src/main/java/org/tron/walletserver/WalletApi.java`
- TS 命令层：`src/adapters/inbound/cli/commands/proposal.ts`、`witness.ts`、`contract.ts`
- TS 用例层：`src/application/use-cases/tron/proposal-service.ts`、`witness-service.ts`、`contract-service.ts`
- TS protobuf / RPC：`src/adapters/outbound/chain/tron/proposal-protobuf.ts`、`tron.ts`、`tx-integrity.ts`
