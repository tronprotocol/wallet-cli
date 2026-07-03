# Wallet-CLI v1 失败用例复测补充报告

## 一、测试概要

| 项目 | 内容 |
|---|---|
| 测试对象 | Wallet-CLI TypeScript CLI，分支 feat/ts-version |
| 测试用例来源 | /Users/admin/Documents/wallet_cil/testcases/wallet-cli-v1-command-modules/Wallet-CLI-完整测试用例.md |
| 测试数据来源 | /Users/admin/Documents/wallet_cil/testcases/wallet-cli-v1-command-modules/wallet-cli-v1-test-data.env |
| 执行入口 | node dist/index.js |
| 执行网络 | tron:mainnet |
| 首轮执行目录 | /Users/admin/Documents/wallet_cil/wallet-cli-feat-ts-version/ts/qa/execution-results/wallet-cli-v1-command-modules-no-ledger-20260702-144259 |
| 复测执行目录 | /Users/admin/Documents/wallet_cil/wallet-cli-feat-ts-version/ts/qa/execution-results/wallet-cli-v1-failed-cases-retest-no-ledger-20260702-151024 |
| 复测时间 | 2026-07-02T07:13:16.264Z |
| 复测策略 | 仅复测首轮失败的 13 条用例；每条用例先执行 help，再执行实际命令；单条实际命令超时 120000ms；Ledger 仍按要求排除；敏感信息已脱敏 |
| 前置处理 | 复测使用独立 WALLET_CLI_HOME，执行器自动创建测试钱包、watch-only 账户并设置默认网络；未修改源码 |

## 二、测试范围

包含：首轮失败的全局参数与帮助、通用命令、本地命令、Token、交易、合约、管理命令全局参数相关用例。

不包含：Ledger 硬件设备相关用例、首轮已通过用例、主网真实资产写入验证、主网广播/质押/合约写入正向提交验证。

## 三、执行结果汇总

| 指标 | 数量 |
|---|---:|
| 首轮失败用例 | 13 |
| 本轮纳入复测 | 13 |
| 排除用例 | 0 |
| 复测通过 | 1 |
| 复测失败 | 12 |
| 复测阻塞 | 0 |
| 复测通过率 | 7.69% |

## 四、模块测试结果汇总

| 模块 | 用例总数 | 执行数 | 通过 | 失败 | 阻塞 | 通过率 | 是否通过 | 备注 |
|---|---:|---:|---:|---:|---:|---:|---|---|
| 全局参数与帮助 | 1 | 1 | 0 | 1 | 0 | 0.00% | 未通过 | 仍存在失败用例 |
| 通用命令 | 3 | 3 | 0 | 3 | 0 | 0.00% | 未通过 | 仍存在失败用例 |
| 本地命令 | 3 | 3 | 0 | 3 | 0 | 0.00% | 未通过 | 仍存在失败用例 |
| Token | 3 | 3 | 0 | 3 | 0 | 0.00% | 未通过 | 仍存在失败用例 |
| 交易 | 1 | 1 | 1 | 0 | 0 | 100.00% | 通过 | 复测通过 |
| 合约 | 1 | 1 | 0 | 1 | 0 | 0.00% | 未通过 | 仍存在失败用例 |
| 管理命令全局参数 | 1 | 1 | 0 | 1 | 0 | 0.00% | 未通过 | 仍存在失败用例 |

## 五、详细测试结果

| 测试用例ID | 模块 | 子模块 | 测试场景 | 前置条件 | 执行命令 | 优先级 | 预期结果 | 实际结果 | 执行结论 | 用例类型 | 回報 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| GLOB-017 | 全局参数与帮助 | 密码 stdin | 密码错误 | 已存在软件钱包 | printf '%s' "wrong-password" \| wallet-cli message sign --message "qa" --account "$QA_ACCOUNT" --password-stdin | P1 | 命令失败；返回 `wrong_password`；不返回签名 | 退出码=1；错误码=auth_failed；error code mismatch; expected one of wrong_password；输出=error [auth_failed]: incorrect master password | 失败 | 异常 | 預期結果偏差 實際結果正常|
| COM-015 | 通用命令 | import private-key | master password 错误后重试 | 已设置 master password；TTY 可交互 | wallet-cli import private-key --label qa-pk-retry | P1 | 第一次密码错误提示 `wrong_password` 或等价错误；允许重新输入；正确密码后继续导入 | 退出码=2；error code mismatch; expected one of wrong_password；输出=spawn node /Users/admin/Documents/wallet_cil/wallet-cli-feat-ts-version/ts/dist/index.js import private-key --label qa-pk-retry ? Master password (hidden): warning: incorrect master password ? Master password (hidden): auth_failed | 失败 | 异常 | 沒復現 |
| COM-025 | 通用命令 | import watch | 当前版本不支持登记 EVM watch-only 地址 | 本地无同名 label | wallet-cli import watch --address "$QA_EVM_ADDRESS" --label qa-watch-evm | P2 | 命令失败；返回 `invalid_option`；不创建账户 | 退出码=2；错误码=invalid_value；error code mismatch; expected one of invalid_option；输出=error [invalid_value]: unrecognised address format: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 | 失败 | 异常 | 預期結果偏差 實際結果正常|
| COM-027 | 通用命令 | import watch | 地址格式非法 | 无 | wallet-cli import watch --address "abc123" --label qa-watch-invalid | P1 | 命令失败；返回 `invalid_option`；不创建账户 | 退出码=2；错误码=invalid_value；error code mismatch; expected one of invalid_option；输出=error [invalid_value]: unrecognised address format: abc123 | 失败 | 异常 | 預期結果偏差 實際結果正常|
| LOC-013 | 本地命令 | derive | 密码错误 | `$QA_SEED_ACCOUNT` 存在 | printf '%s' "wrong-password" \| wallet-cli derive --account "$QA_SEED_ACCOUNT" --label qa-derived-wrong --password-stdin | P1 | 命令失败；返回 `wrong_password`；不派生账户 | 退出码=1；错误码=auth_failed；error code mismatch; expected one of wrong_password；输出=error [auth_failed]: incorrect master password | 失败 | 异常 | 預期結果偏差 實際結果正常|
| LOC-019 | 本地命令 | backup | 密码错误 | `$QA_ACCOUNT` 为软件钱包 | wallet-cli backup --account "$QA_ACCOUNT" --out "$BACKUP_DIR/wrong-password.json" | P1 | 命令失败；返回 `wrong_password`；不生成文件 | 退出码=1；错误码=auth_failed；error code mismatch; expected one of wrong_password；输出=error [auth_failed]: incorrect master password | 失败 | 异常 | 預期結果偏差 實際結果正常|
| LOC-029 | 本地命令 | config | timeout 边界值 | 无 | wallet-cli config timeoutMs 0 | P2 | 当前实现允许非负数 timeoutMs；写入成功并返回配置结果 | 退出码=2；错误码=invalid_value；expected success but exit=2；输出=error [invalid_value]: timeoutMs must be a positive number | 失败 | 边界 | 預期結果偏差 實際結果正常|
| MGT-TOKEN-007 | Token | token add | 添加 TRC20 到地址簿 | 合约未添加 | wallet-cli token add --contract $QA_CONTRACT_TRC20 --network $NETWORK_TRON | P1 | 添加成功；随后 `token list` 可见 | 退出码=2；错误码=token_already_listed；expected success but exit=2；输出=error [token_already_listed]: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t is already an official token on tron:mainnet | 失败 | 正常 | 預期結果偏差 實際結果正常|
| MGT-TOKEN-008 | Token | token add | 重复添加 | 合约已添加 | wallet-cli token add --contract $QA_CONTRACT_TRC20 --network $NETWORK_TRON | P2 | 返回已存在或幂等成功，不产生重复项 | 退出码=2；错误码=token_already_listed；expected success but exit=2；输出=error [token_already_listed]: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t is already an official token on tron:mainnet | 失败 | 边界 | 預期結果偏差 實際結果正常|
| MGT-TOKEN-012 | Token | token remove | 移除用户 TRC20 | 已添加用户 token | wallet-cli token remove --contract $QA_CONTRACT_TRC20 --network $NETWORK_TRON | P1 | 移除成功；`token list` 不再展示用户项 | 退出码=2；错误码=token_is_official；expected success but exit=2；输出=error [token_is_official]: cannot remove an official token: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t | 失败 | 正常 | 預期結果偏差 實際結果正常|
| MGT-TX-007 | 交易 | tx send | 发送 TRC10 代币 | asset-id 有效 | wallet-cli tx send --to $QA_TRON_ADDRESS --amount 1 --asset-id $QA_ASSET_ID --network $NETWORK_TRON --dry-run | P1 | 返回 TRC10 transfer plan | 退出码=0；expected success observed；输出=⏳ Dry run tx send Fee TRC10 transfer uses bandwidth only Tx bddf4e6302...56921342 | 通过 | 正常 | 預期結果偏差 實際結果正常|
| MGT-CONTRACT-010 | 合约 | contract deploy | 带 constructor 参数部署 | ABI/bytecode 有效 | wallet-cli contract deploy --abi "$QA_ABI_JSON" --bytecode $QA_BYTECODE_HEX --fee-limit 100000000 --constructor-sig 'constructor(uint256)' --params '[{"type":"uint256","value":"1"}]' --network $NETWORK_TRON --dry-run | P1 | constructor 参数编码正确，返回部署预览 | 退出码=2；错误码=invalid_option；expected success but exit=2；输出=error [invalid_option]: unknown option(s): --constructor-sig, --constructor-sig | 失败 | 正常 | |
| MGT-GLOBAL-003 | 管理命令全局参数 | global | timeout 设置 | 网络可访问 | wallet-cli account info --account $QA_ACCOUNT --network $NETWORK_TRON --timeout 1 | P2 | 当前查询在 1ms 参数下仍可能快速成功；命令不应卡死，成功或 timeout 均需稳定返回 | 退出码=1；错误码=rpc_error；expected success but exit=1；输出=error [rpc_error]: TRON getAccount failed: The operation was aborted due to timeout | 失败 | 边界 | 預期結果偏差 實際結果正常 |

## 六、问题清单

| 问题ID | 严重级别 | 问题描述 | 影响用例数 | 关联用例 | 影响说明 | 修复建议 |
|---|---|---|---:|---|---|---|
| RETEST-BUG-001 | 中 | 密码错误场景错误码仍为 auth_failed，与用例期望 wrong_password 不一致 | 4 | GLOB-017, COM-015, LOC-013, LOC-019 | 错误码契约仍未对齐，调用方无法按 wrong_password 分支处理。 | 统一产品错误码为 wrong_password，或将 PRD/用例预期调整为 auth_failed 并补充 message 断言。 |
| RETEST-BUG-002 | 中 | watch 地址格式异常错误码仍为 invalid_value，与预期 invalid_option 不一致 | 2 | COM-025, COM-027 | 参数校验错误分类仍不一致。 | 明确地址格式错误归类，并同步 CLI 实现、help 文档与测试用例。 |
| RETEST-BUG-003 | 中 | 配置 timeoutMs=0 被实现拒绝，与边界用例预期不一致 | 1 | LOC-029 | 配置边界规则不一致，当前实现要求 timeoutMs 为正数。 | 若产品定义允许 0，需放宽校验；若不允许，更新用例预期为 invalid_value。 |
| RETEST-BUG-004 | 中 | 官方 Token 地址簿添加/删除行为与用例预期不一致 | 3 | MGT-TOKEN-007, MGT-TOKEN-008, MGT-TOKEN-012 | 官方 Token 重复添加返回 token_already_listed，删除官方 Token 返回 token_is_official，正向用例仍失败。 | 确认官方 Token 是否允许用户重复添加/删除；按产品规则修订用例或调整实现为幂等成功。 |
| RETEST-BUG-005 | 高 | contract deploy constructor 参数命令契约不一致 | 1 | MGT-CONTRACT-010 | 当前 CLI 不支持 --constructor-sig，带 constructor 参数部署 dry-run 无法通过。 | 补齐 --constructor-sig 兼容参数，或将用例改为当前 CLI 支持的 constructor 参数表达方式。 |
| RETEST-BUG-006 | 中 | 1ms timeout 链上查询仍返回 rpc_error，边界行为未满足用例预期 | 1 | MGT-GLOBAL-003 | 极短 timeout 下行为稳定失败，不能满足“成功或稳定 timeout”预期中的成功分支。 | 明确 1ms timeout 的标准预期；建议用例接受 timeout/rpc_error，或实现返回统一 timeout 错误码。 |

## 七、复测通过清单

| 用例ID | 模块 | 子模块 | 测试场景 | 说明 |
|---|---|---|---|---|
| MGT-TX-007 | 交易 | tx send | 发送 TRC10 代币 | 由失败转为通过 |

## 八、补充质量门禁

| 检查项 | 结果 | 说明 |
|---|---|---|
| npm run build | 通过 | 本轮复测前已完成构建，dist/index.js 可执行 |
| npm run typecheck | 通过 | 上轮完整测试后已执行 tsc --noEmit，退出码 0 |
| npm test | 未通过 | 上轮验证中存在 crypto、keystore、wallet create、golden backup 相关超时失败，本轮未重复执行单元测试 |
| Ledger 专项 | 未执行 | 按用户要求排除 Ledger/硬件钱包相关用例 |

## 九、Ledger 排除清单

| 用例ID | 子模块 | 场景 | 处理说明 |
|---|---|---|---|
| COM-017 | import ledger | 按 index 导入 TRON Ledger 账户 | 需 Ledger 硬件/设备确认，本轮按范围排除 |
| COM-018 | import ledger | 按 path 导入 Ledger | 需 Ledger 硬件/设备确认，本轮按范围排除 |
| COM-019 | import ledger | 按地址扫描导入 | 需 Ledger 硬件/设备确认，本轮按范围排除 |
| COM-020 | import ledger | 导入 EVM Ledger 账户 | 需 Ledger 硬件/设备确认，本轮按范围排除 |
| COM-021 | import ledger | index/path 互斥 | Ledger 模块整体排除，参数校验可后续单独补测 |
| COM-022 | import ledger | scan-limit 缺少 address | Ledger 模块整体排除，参数校验可后续单独补测 |
| COM-023 | import ledger | 设备未连接 | 需 Ledger 硬件/设备状态，本轮按范围排除 |

## 十、结论建议

- 本轮失败用例复测未通过：13 条首轮失败用例中 1 条复测通过，12 条仍失败。
- 已恢复/转绿用例：MGT-TX-007，本轮 TRC10 dry-run 查询未再出现 RPC 429，判定通过。
- 仍需修复或对齐的重点：错误码契约（wrong_password/auth_failed、invalid_option/invalid_value）、timeoutMs=0 边界定义、官方 Token 地址簿幂等规则、contract deploy constructor 参数兼容、1ms timeout 错误码规范。
- 建议修复后继续按本报告 12 条失败用例做定向复测，再执行完整非 Ledger 回归确认无连带回归。

## 十一、报告附件

| 附件 | 路径 |
|---|---|
| 复测原始日志 | /Users/admin/Documents/wallet_cil/wallet-cli-feat-ts-version/ts/qa/execution-results/wallet-cli-v1-failed-cases-retest-no-ledger-20260702-151024/raw-execution-log.md |
| 复测结构化结果 | /Users/admin/Documents/wallet_cil/wallet-cli-feat-ts-version/ts/qa/execution-results/wallet-cli-v1-failed-cases-retest-no-ledger-20260702-151024/results.json |
| 复测执行器报告 | /Users/admin/Documents/wallet_cil/wallet-cli-feat-ts-version/ts/qa/execution-results/wallet-cli-v1-failed-cases-retest-no-ledger-20260702-151024/test-report.md |
| 首轮完整报告 | /Users/admin/Documents/wallet_cil/wallet-cli-feat-ts-version/ts/qa/execution-results/wallet-cli-v1-command-modules-no-ledger-20260702-144259/test-report.md |
