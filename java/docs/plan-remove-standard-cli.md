# Java 版移除 Standard CLI —— 实测移除清单与执行计划

> 目标：把 `ts/Wallet-CLI 命令需求文档v4.13.0.md` §12「Java 版移除 Standard CLI」的意图，落成一份**逐项可执行、经代码实测核对**的移除清单。
>
> 核对基线：`feat/architecture-evm-extension`（`701c58c7`），核对日期 2026-08-26；决策定案 2026-08-27。
> 所有数字均由仓库实测得出，非引用需求文档。路径除特别说明外均相对 `java/`。
>
> **本文件取代 §12.2 / §12.3 作为施工图。** §12 的决策方向有效，其量化与前置判断不可直接施工——偏差见 §0.1。
> **§0.4 是已定案的决策记录；全文按其改写，不再有待裁决项。**

---

## 0. 先读这一节

### 0.1 §12 与代码实测的事实性偏差（照原样执行会漏删 / 误删 / 误判）

| # | §12 原文 | 实测结果 | 影响 |
| --- | --- | --- | --- |
| D-1 | 测试「**2 个测试类**」 | `src/test/java/org/tron/walletcli/cli/` 下 **19 个测试类**，另有 2 个 QA 工具类与 **3 个**外部测试文件受影响 | 漏 17 个测试类 + QA 工具链 |
| D-2 | 文档「**5 篇**」 | `java/docs/` 下**只存在 1 篇**：`standard-cli-contract-spec.md`。其余 4 篇全仓库不存在 | 真正要改的是 `CLAUDE.md` 等引用方，§12 未列 |
| D-3 | 入口挂钩「4 import + **9 处** register + main 分支」 | import 4 个（正确）；`initRegistry()` 是 **10 处** register（漏算 `AliasCommands`）；「main 分支」实际是 `runMain()`（`Client.java:4758-4845`）**整体重写** | 改造量被严重低估（§3） |
| D-4 | `*ForCli` 方法族＝**3 个**方法 | **65 个**不同名字、**101 处**声明 | 移除动作里最大的一块（§5.1） |
| D-5 | §12.3-1：Java 侧 Ledger「**只在 Standard CLI 这条路上做过**」 | **不成立**。`org.tron.ledger` 是独立 24 文件包，交互式 shell 自身即有完整 Ledger 支持（`Client.java:113-115`、`:228`、`:500-542`、`:3742`）。Standard CLI 专属的只有 `cli/ledger/`（6 文件） | §12.3-1 的「二选一」是伪选择题；release note 措辞须改（§5.2） |
| D-8 | 「Java 版随本版做 major 级跳跃」 | 版本常量在 `common/utils/Utils.java:141`（`" v4.12.0"`），**不在** `Client.java`；`build.gradle:22` 的 `'1.0-SNAPSHOT'` 与之无关 | 位置须对（§8.2）。**该要求已由 §0.4-D3 决定不执行** |
| **D-9** | §12 认为 `cli/` 与主源码的耦合仅有 `*ForCli` 与 Ledger 分支 | **不成立**。`cli/` 有 **3 个类型**泄漏进主源码：`CommandErrorException`（127 处）、`cli.ledger.LedgerSigner`、`cli.ledger.LedgerSignOutcome` | **最严重的遗漏**：不先处置就删 `cli/` 整包，编译必然失败（§5.0）；且这是 §9.0 循环依赖的成因 |
| **D-10** | §12 以「`*ForCli` 后缀」界定移除范围 | 大量 Standard-CLI-only 代码**不带该后缀**：`*OrThrow` 家族、`LAST_CLI_OPERATION_ERROR` 机制（49 处调用）、`standardCli` 布尔参数（13 处）、`printMnemonicPath`、`passwordValidQuiet`、`deleteFilesQuiet` 等，共 **18 个符号** | 按后缀删会留下成片死代码（§5.1.3） |
| **D-11** | §12 未提及 | `MASTER_PASSWORD` 环境口令通道实现在 `common/utils/Utils.java` 的**交互式口令提示函数内部** | 见 §5.4。**注意其真实状态见 D-15** |
| **D-12** | §12 未提及 | alias 的 3 个 json 资源（`src/main/resources/aliases/`，git 追踪）、`qaRun` gradle 任务（`build.gradle:163-168`）、`java/.gitignore:22-25` | 会留下孤儿资源与损坏的 gradle 任务（§5.3 / §6） |

#### 决策评审（2026-08-27）中发现的 5 项事实更正

这 5 条推翻了本计划早前版本自己的断言，与决策无关，无论如何都要改：

| # | 早前版本的断言 | 实测事实 | 出处 |
| --- | --- | --- | --- |
| **D-13** | §6：`java/qa/` 是「交互式 REPL 与 standard CLI 的比对测试」（沿用 `CLAUDE.md:98` 的说法） | **`qa/` 从未测过 REPL**。103 个用例**全部**经 `java -jar wallet-cli.jar --network <net> [--output json] <args>` 调用，即纯 Standard CLI；所谓 text/json 比对是 **Standard CLI 自身的两种输出模式**互比 | `qa/lib/cli.sh:733,770-776`；`qa/manifest.tsv` 103 行，分类全为 `noauth-success`/`stateful-success`/… 无交互类 |
| **D-14** | §5.4：只删 `cli/` 会「在 REPL 提示路径里留下一条**活的**环境变量秘密通道」 | **该分支今天就已不可达**。Standard CLI 走自己的取密码路径（`StandardCliRunner:61-65` → `System.getenv("MASTER_PASSWORD")`），**不经** `Utils.inputPassword`。后者的分支由 `isEnvPasswordInputEnabled()` 把关，而 `setEnvPasswordInputEnabled` **全仓库只有测试调用**。它是**休眠**通道，不是活通道 | `Utils.java:342-343,400`；`grep setEnvPasswordInputEnabled` 仅命中 `UtilsPasswordTest:42,48,50` 与 `StandardCliRunnerTest:302,310` |
| **D-15** | §3.2：`--interactive`「是**文档化的**显式进入交互式 shell 的方式……必须保留，无讨论空间」 | **它没有被文档化**。`java/README.md` 记载的启动方式是裸 `java -jar wallet-cli.jar`（`:46`、`:61`），从未提 `--interactive`；该 flag 唯一的文档是 §7.1 要删的 `standard-cli-contract-spec.md`，以及随包消失的 `CommandRegistry:59` 帮助文本。它本质是 **Standard CLI 时代从非交互入口逃进 REPL 的便利 flag** | `grep -rn -- "--interactive"` 全仓库 |
| **D-16** | §9.1：合并后的 commit 3「约 7,000+ 行」 | **约 11,900 行**（`cli/` 主包 6,773 + `cli/` 测试 4,950 + QA 工具类 160 + alias 资源 14），**尚未计入** `WalletApiWrapper`/`WalletApi` 内 `*ForCli` 的删除量；实际接近 14,000 行 | 逐项 `wc -l` |
| **D-17** | §5.3 / Q-5：`Wallet/aliases/` 会不会被 REPL 的 `Wallet/` 扫描误认，「须验证」 | **已验证：会，且这是今天就存在的 REPL 缺陷**。`WalletApi.java:688`/`:747` 以 `listFiles((dir, name) -> !name.equals(".active-wallet"))` 列目录，**不过滤子目录**，故 `Wallet/aliases/` 会作为一个条目进入编号选择器、计入 `wallets.length`、可被选中，随后按 keystore 解析失败 | `WalletApi.java:684-700` |

### 0.2 §12 的非目标

需求文档第 35 行：**「不动 Java 交互式 shell 本身」**。

本计划**有意**触及交互路代码的地方，均已在 §0.4 中获得决策授权：

| 处 | 触及点 | 授权 |
| --- | --- | --- |
| §3.2 | `runMain` 重写；`--interactive` **移除** | D4 + D13 |
| §5.0 | `CommandErrorException` 迁包（`getUSDTBalance` 等 REPL 可达方法引用它） | D5 |
| §5.1 | 删 `*ForCli` 时的共用辅助判定 | — |
| §5.2 | `LedgerEventListener:241,247,253` 与 `WalletApiWrapper:3337` 的 REPL 输出守卫折叠 | — |
| §5.3 | `WalletApi:688,747` 的 `Wallet/` 扫描过滤器**加固** | D8 |
| §5.4 | `Utils.inputPassword()` 删除环境口令分支 | D10 |

### 0.3 §12 四件交付物的最终处置

| 交付物 | §12 要求 | 本版处置 | 依据 |
| --- | --- | --- | --- |
| 命令映射表 | 逐条覆盖 107 条 | **不做** | §0.4-D2 |
| 版本号 major 跳跃 | 让锁定构建不自动升级 | **不做**，随 TS 走 `v4.13.0` | §0.4-D3 |
| 启动兜底 | 含替代命令与映射表地址 | **做**，但简化为一行 + TS 包名 | §0.4-D4 |
| 社区通知 | Release note + Discussions + 官方渠道 | **做**，且承载完整 breaking changes 清单 | §0.4-D14 |

> 前两项属对 §12 的**显式偏离**，已获决策确认，不再复议。因兜底信息被简化，release note 实际承担了几乎全部触达职责（§8.3）。

### 0.4 决策记录（2026-08-27 定案，全部已拍板）

| # | 事项 | 决策 | 影响章节 |
| --- | --- | --- | --- |
| D1 | TS 侧能力覆盖是否先审计 | **不审计**。直接移除，不做 107 → TS 的逐条比对，不设覆盖闸门 | §8.1 删除 |
| D2 | 命令映射表 | **不产出**。§8.1、§7.3 及相关验收脚本全部删除 | §7.3 · §8.1 |
| D3 | 版本号 | **`v4.13.0`**，与 TS 保持锁步（放弃 §12 的 major 跳跃） | §8.2 |
| D4 | `runMain` argv 白名单 | 无参数 → REPL；`--version` → 打印版本；`--help` → 用法 + 兜底提示；**其余一律兜底 exit 2** | §3.2 |
| D5 | `CommandErrorException` 落点 | **`org.tron.core.exception`**（该包已有 7 个异常，含 `signTransactionForCli` 正在抛的 `CancelException`） | §5.0 |
| D6 | 兜底提示内容 | **一行 + TS 包名**，stderr，exit 2。不含映射表 URL | §3.3 |
| D7 | alias 功能 | **随包取消**（8 文件 + `ActiveWalletConfig` + `AliasCommands` + 3 个 json 资源 + 6 个测试） | §5.3 |
| D8 | alias 落盘数据 | **纳入范围**：`WalletApi:688,747` 加 2 行过滤跳过子目录；`.active-wallet` 过滤器**保留不动**（删掉它会让选择器更糟） | §5.3 · §5.5 |
| D9 | `java/qa/` | **整体删除，不建替代**。并更正 `CLAUDE.md` 中「REPL vs standard CLI 比对」的错误描述（见 D-13） | §6 · §7.2 |
| D10 | `MASTER_PASSWORD` 环境通道 | **删除**分支、3 个方法、ThreadLocal，及 `UtilsPasswordTest` 全部 5 个用例（整文件删） | §5.4 |
| D11 | commit 3 拆分 | **拆**。新增 commit 2.5「Ledger 类型前置迁出」打破循环依赖，commit 3 拆为 3a（机械批删）/ 3b（外科手术） | §9.1 |
| D12 | 测试专属符号 | **连同测试一起删**。规则：引用计数**只数 `src/main`**，`src/test` 不计 | §5.1.3 · §5.1.5 |
| D13 | `--interactive` | **移除**。REPL 的启动方式回归唯一一种：裸 `java -jar wallet-cli.jar` | §3.2 |
| D14 | Release note | **完整 breaking changes 清单**（见 §8.3） | §8.3 |

---

## 1. 决策复述

- Java 版一次性移除 Standard CLI（`org.tron.walletcli.cli`），**不留弃用过渡版本**。
- 移除后 Java 版**只剩交互式 shell 一个入口**，且启动方式只有裸 `java -jar wallet-cli.jar` 一种。
- 所有非交互 / 脚本 / CI 场景改用 TS 版。

---

## 2. 移除范围总表（实测量化）

| 类别 | 规模 | 位置 | 处置 | 详见 |
| --- | --- | --- | --- | --- |
| Standard CLI 主包 | **39 文件 / 6,773 行** | `src/main/java/org/tron/walletcli/cli/` | 整包删除（3 个泄漏类型先处置） | §4.1 |
| `CommandErrorException` 迁移 | 1 类 + 127 处引用 | `cli/` → `org.tron.core.exception` | **commit 1 先迁** | §5.0 |
| `cli.ledger` 两类型前置迁出 | 2 类 | `LedgerSigner` · `LedgerSignOutcome` | **commit 2.5 临时迁出**，3b 随包删 | §9.0 |
| 入口挂钩 | 4 import + 10 register + `runMain()`（`:4758-4845`）重写 + 2 孤儿 import（`:68-69`） | `walletcli/Client.java` | 改写 | §3 |
| 测试（整体删除） | **19 个测试类** | `src/test/java/org/tron/walletcli/cli/**` | 删除 | §4.2 |
| 测试（改写） | **3 个文件** | `WalletApiWrapperTest` / `ClientMainTest` / `WalletApiTest` | 改写 | §4.2 |
| 测试（整文件删） | 1 个 | `common/utils/UtilsPasswordTest`（5 用例全删） | 删除 | §4.2 · §5.4 |
| QA 工具类 | 2 个文件 | `src/test/java/org/tron/qa/` | 删除 | §6 |
| QA shell 体系 | **11 文件** + **2 个** gradle 任务 + gitignore 4 行 | `java/qa/`、`build.gradle:154-168`、`.gitignore:22-25` | 删除 | §6 |
| `*ForCli` 方法族 | **65 个名字 / 101 处声明** | `WalletApiWrapper` / `WalletApi` / `ApiClient` | 删除（交互路零调用） | §5.1 |
| 无 `ForCli` 后缀的 CLI-only 残留 | **18 个符号** | 见 §5.1.3 | 删除 | §5.1.3 |
| Ledger 非交互适配 | 6 文件 + **4 处注入点** + `LedgerEventListener` 残留 | `cli/ledger/`、`WalletApi:180-187,1056-1140`、`WalletApiWrapper:129-133,3290-3301` | 删除适配层与注入点，**`org.tron.ledger` 24 文件全保留** | §5.2 |
| alias 功能 | 10 Java + **3 资源** + 6 测试 | `cli/aliases/`、`ActiveWalletConfig`、`AliasCommands`、`resources/aliases/*.json` | **取消** | §5.3 |
| `Wallet/` 扫描加固 | 2 处，各 +1 行 | `WalletApi.java:688`、`:747` | 跳过子目录 | §5.3 |
| `MASTER_PASSWORD` 环境通道 | 6 处 | `common/utils/Utils.java:127,342-343,379,392,400` | 删除 | §5.4 |
| 文档 | 1 篇删除 + 1 处实质改写 + 2 处复核 | `java/docs/`、`CLAUDE.md`、两份 `README.md` | 删除 / 改写 | §7 |
| 版本号 | 1 处 | `common/utils/Utils.java:141` | → `" v4.13.0"` | §8.2 |

---

## 3. 入口改造：`Client.java`

### 3.1 现状（实测）

- **imports**（`:34-37`）：`GlobalOptions`、`CommandRegistry`、`OutputFormatter`、`StandardCliRunner`。
- **`initRegistry()`**（`:4869-4882`）：**10 处** register，含 `AliasCommands`。
- **`runMain(String[] args)`**（`:4758-4845`）：整体是 Standard CLI 骨架——① `GlobalOptions.parse` + `usageError`→2；② `--version` 分支（含 JSON 形态）；③ 交互式分支；④ `--help` 分支；⑤ `command == null` → `usageError` → 2；⑥ 兜底 `StandardCliRunner.execute()`。
- **仅服务 Standard CLI 的辅助方法**：`shouldLaunchInteractiveByDefault()`（`:4847`）、`requestsJsonOutput()`（`:4855`）、`initRegistry()`（`:4869`）。
- **`GlobalOptions`（`:9-18`）共解析 10 个全局选项**：`--interactive` · `--help` · `--version` · `--output` · `--network` · `--wallet` · `--grpc-endpoint` · `--quiet` · `--verbose` · `--password-stdin`。删除后**全部不再被识别**。

### 3.2 目标形态（决策 D4 + D13）

| 输入 | 行为 | 退出码 |
| --- | --- | --- |
| 无参数 | 进入交互式 shell | 0 |
| `--version` | 打印 `wallet-cli v4.13.0`（**纯文本，无 JSON 信封**） | 0 |
| `--help` | 打印交互式 shell 用法 + §3.3 兜底提示 | 0 |
| **其他任何参数**（含 `--interactive`、子命令名、`--output json`、`--network …`） | §3.3 兜底提示 | **2** |

> **`--interactive` 一并移除**（D13）。依据见 D-15：它从未被文档化，`java/README.md` 记载的启动方式只有裸 `java -jar wallet-cli.jar`；其唯一文档随 §7.1 删除的 spec 一同消失。移除后 REPL 启动方式回归单一。

**argv 解析归属**：`GlobalOptions` 随 `cli/` 删除，新的 `runMain()` **自己做一次极简判断**，不保留也不新建解析框架：

```java
static int runMain(String[] args) {
  if (args.length == 0)                                    { /* 进 REPL；return 0 */ }
  if (args.length == 1 && "--version".equals(args[0]))     { /* 打印 "wallet-cli" + VERSION；return 0 */ }
  if (args.length == 1 && "--help".equals(args[0]))        { /* 用法 + 兜底提示；return 0 */ }
  /* 其余：System.err 打印 §3.3 兜底提示；return 2; */
}
```

REPL 自身的参数解析仍由 JCommander 承担（`Client.java` 现有机制不变）。

**删除**：`shouldLaunchInteractiveByDefault()`、`requestsJsonOutput()`、`initRegistry()`、`:68-69` 的 `LinkedHashMap`/`Map` 孤儿 import（实测二者仅被 `:4781` 的 `--version` JSON 分支使用）。
**保留**：`main()` → `System.exit(runMain(args))` 形状；交互式 shell 内的 `Version` 命令（`:3666`）。

> **实测澄清（易误判）**：`shouldLaunchInteractiveByDefault`（`:4847-4852`）第一个条件就是 `args.length == 0`。因此**今天**只要 argv 非空——包括单独传 `--network nile` / `--quiet` / `--verbose`——都**不会**进入交互式 shell，而是落到 `getCommand()==null` 分支打 `usageError` 并 exit 2。**§3.2 对这些裸全局 flag 不构成行为变更**，只是提示内容换成兜底文案。真正的入口行为变更只有 `--interactive` 被移除这一项。

### 3.3 启动兜底提示（决策 D6）

**去向** `System.err`；**退出码 `2`**（与原 Standard CLI 用法错误码一致，脚本「非 0 即失败」的判断仍成立）。

**内容：一行，含 TS 包名。** 形如：

```
Standard CLI has been removed in v4.13.0. Use the TypeScript CLI instead: @tron-walletcli/wallet-cli
```

- **不含**映射表 URL（D2 已取消映射表）。
- **不得**输出 JSON 信封（`OutputFormatter` 已删，且信封会让脚本误判契约仍在）。
- 详细迁移信息由 release note 承担（§8.3）。

---

## 4. 直接删除清单

### 4.1 主包 `src/main/java/org/tron/walletcli/cli/`（39 文件 / 6,773 行）

| 子目录 | 文件 |
| --- | --- |
| 根（14） | `ActiveWalletConfig` · `CliAbortException` · `CliUsageException` · `CommandContext` · `CommandDefinition` · **`CommandErrorException`（commit 1 先迁出）** · `CommandHandler` · `CommandRegistry` · `GlobalOptions` · `OptionDef` · `OutputFormatter` · `ParsedOptions` · `StandardCliRunner` · `StdinPasswordReader` |
| `aliases/`（8） | `AliasEntry` · `AliasResolutionException` · `AliasResolver` · `AliasStore` · `AliasStoreLoader` · `AliasType` · `AliasValidation` · `ResolutionResult` |
| `commands/`（11） | `AliasCommands` · `CommandSupport` · `ContractCommands` · `ExchangeCommands` · `MiscCommands` · `ProposalCommands` · `QueryCommands` · `StakingCommands` · `TransactionCommands` · `WalletCommands` · `WitnessCommands` |
| `ledger/`（6） | `LedgerPorts` · **`LedgerSigner`（commit 2.5 先迁出）** · **`LedgerSignOutcome`（同）** · `NonInteractiveLedgerSigner` · `ProductionLedgerPorts` · `SystemOutSuppressor` |

**泄漏核对方法**（对 `cli/` 下每个类名逐个执行，非抽样）：

```bash
for c in $(find src/main/java/org/tron/walletcli/cli -name '*.java' -exec basename {} .java \;); do
  n=$(grep -rn "\b$c\b" --include="*.java" src/main | grep -vc "/walletcli/cli/")
  [ "$n" -gt 0 ] && echo "LEAK $c ($n)"
done
```

**各阶段期望输出**（写成分阶段才不会「照字面执行就失败」）：

| 阶段 | 期望 | 说明 |
| --- | --- | --- |
| 当前基线 | **17 行** | `CommandErrorException` 127 · `OutputFormatter` 17 · `CommandRegistry` 6 · `StandardCliRunner` 4 · `GlobalOptions` 4 · `LedgerSignOutcome` 4 · `LedgerSigner` 3 · 10 个 `*Commands` 各 1 |
| commit 1 后 | 16 行 | `CommandErrorException` 迁出 |
| commit 2 后 | **3 行** | `LedgerSigner` · `LedgerSignOutcome` · `StandardCliRunner`。注意 `StandardCliRunner` 的 4 处中**只有 2 处在 `Client.java`**（`:37` import、`:4843` 构造），另 2 处是注释——`WalletApiWrapper:3193` 与 `WalletApi:181` |
| commit 2.5 后 | 1 行 | 仅剩 `StandardCliRunner` 的两处注释 |
| commit 3a 后 | **0 行** | — |

### 4.2 测试

**整体删除（19 个，`src/test/java/org/tron/walletcli/cli/`）**：

`ActiveWalletConfigTest` · `CommandDefinitionTest` · `GlobalOptionsTest` · `OutputFormatterTest` · `OutputFormatterResolvedTest` · `ParsedOptionsAliasTest` · `StandardCliRunnerTest` · `StdinPasswordReaderTest` · `aliases/AliasEntryTest` · `aliases/AliasResolverTest` · `aliases/AliasStoreLoaderTest` · `aliases/AliasStoreTest` · `aliases/AliasValidationTest` · `commands/StakingResourceGuardTest` · `commands/StandardCliCommandRoutingTest` · `commands/TransactionCommandsTest` · `ledger/LedgerSignOutcomeTest` · `ledger/NonInteractiveLedgerSignerTest` · `ledger/SystemOutSuppressorTest`

**整文件删除（1 个）**：`common/utils/UtilsPasswordTest` —— 5 个用例全部依赖 §5.4 删除的 API（`:10`/`:21`/`:31` 测 `resolveEnvPassword`，`:41`/`:47` 测开关）。

**改写（3 个）**：

| 文件 | 依赖 | 处置 |
| --- | --- | --- |
| `walletcli/WalletApiWrapperTest.java:9` | `import …cli.CommandErrorException` | commit 1 随迁移改 import。**共 6 个用例须删**：`registerWalletForCli` 两个（`:180`/`:205`）、`throwIfCliOperationFailed*` 两个（`:229`/`:249`，并覆写 `:232`/`:252` 的 `consumeLastCliOperationError`）、以及 `:109`/`:131`（依 D12 连同 `triggerConstantContractExtention` / `estimateEnergyMessage` 一并删）。`setWallet` 用法（`:168`）随 D12 删除 |
| `walletcli/ClientMainTest.java:8` | `import …cli.GlobalOptions` | 改写为验证 §3.2 新契约：无参→REPL；`--version`/`--help`→0；**`--interactive` 与其他参数→兜底 + exit 2** |
| `walletserver/WalletApiTest.java:112,124` | `walletApi.sendCoinForCli(...)` | **易漏**：该文件不 import `walletcli.cli`，§9.3 的 `walletcli.cli` grep 抓不到它，只有 `ForCli` grep 能抓到。删除该用例 |

**可能成为孤儿**：`keystore/ClearWalletUtilsTest` —— 若 `ClearWalletUtils.deleteFilesQuiet` 随 §5.1.3 删除则成孤儿，一并删。

---

## 5. 关联代码处置

### 5.0 【commit 1】`CommandErrorException` 迁移（D-9 / 决策 D5）

**实测**：`grep -rn "CommandErrorException" --include="*.java" src/main | grep -v '/walletcli/cli/' | wc -l` → **127**

| 文件 | 提及数 | 说明 |
| --- | --- | --- |
| `walletcli/WalletApiWrapper.java` | **125** | 拆分：`:119` import 1 处 + `*ForCli` 方法内 79 处（随之删除）+ **非 `ForCli` 方法内 45 处**（1 + 79 + 45 = 125） |
| `walletserver/WalletApi.java` | 1 | `:1084`，**全限定名**，位于 `signTransactionForCli` 的 ledger 分支内（随之删除） |
| `gasfree/GasFreeApi.java` | 1 | `:278` **仅注释**，改注释即可 |

**12 个非 `ForCli` 使用者，按「删除后是否存活」分类**（其中 **10 个自身就是 CLI-only，会一并删除**）：

| 方法 | 用量 | REPL 可达？ | 归宿 |
| --- | --- | --- | --- |
| `getUSDTBalance` | 2 | **是**（`Client.java:3915`→`:4452`/`:4496`） | **存活** |
| `gasFreeTransferInternal` | 11 | **是**（`gasFreeTransfer:3188` ← `Client.java:4167`/`:4611`） | **存活**（须折叠 `standardCli`，见 §5.1.4） |
| `getGasFreeInfoData` | 11 | 否 | 删（85 行，`:3011-3095`） |
| `gasFreeTraceData` | 5 | 否 | 删（`:3405-3429`） |
| `getUSDTBalanceExact` | 1 | 否 | 删（`:2350-2371`） |
| `triggerConstantContractExtention` | 1 | 否 | 删（`:2295-2313`，D12） |
| `estimateEnergyMessage` | 2 | 否 | 删（`:2385-2406`，D12） |
| `generateSubAccountOrThrow` · `unlockOrThrow` · `throwCliError` · `throwIfCliOperationFailed` · `validateCliWalletName` | 4/2/3/2/1 | 否 | 删（§5.1.3） |

> **迁移理由要精确**：`CommandErrorException` 必须迁移，但**只因为 `getUSDTBalance` 与 `gasFreeTransferInternal` 两个方法**（后者的引用点见 §5.1.4 末尾的 catch 子句）。若为 12 个方法全体而迁移，会顺带保住约 130 行死代码。

**落点（D5）**：`org.tron.core.exception` —— 该包已有 7 个异常（`TronException` / `CancelException` / `CipherException` / `EncodingException` / `BadItemException` / `StoreException` / `ZksnarkException`），`WalletApi` / `WalletApiWrapper` 已在 import 它，且 `signTransactionForCli` 本身就抛该包的 `CancelException`。**纯包移动，不改类名、不改语义。**

**commit 1 的改动点必须齐全，否则不编译**：

| # | 位置 | 说明 |
| --- | --- | --- |
| ① | `WalletApiWrapper.java:119` | import |
| ② | `WalletApi.java:1084` | **全限定名** `org.tron.walletcli.cli.CommandErrorException`，无 import，改 import 覆盖不到它 |
| ③ | `cli/StandardCliRunner.java:138` | **同包裸名** `catch (CommandErrorException e)`，迁包后必须补 import |
| ④ | 4 个测试文件 | `WalletApiWrapperTest`、`cli/StandardCliRunnerTest`、`cli/commands/TransactionCommandsTest`、`cli/commands/StandardCliCommandRoutingTest`（后三者到 3a 才删，但 `build` 会编译测试） |
| ⑤ | `GasFreeApi.java:278` | 注释 |

### 5.1 `*ForCli` 方法族

#### 5.1.1 结论

`Client.java` 对 `*ForCli` 的引用数为 **0**。主源码调用方全在 `cli/commands/**`、`cli/ledger/LedgerSigner`，或其他 `*ForCli` 内部（如 `WalletApiWrapper:1744`）。→ 按 §12.3-2 第一结论**随包删除**，**不需要**改名去后缀。

| 文件 | 总行数 | `*ForCli` 声明 | `ForCli` 提及 |
| --- | --- | --- | --- |
| `walletcli/WalletApiWrapper.java` | 3,499 | 55 | 144 |
| `walletserver/WalletApi.java` | 4,697 | 45 | 93 |
| `walletserver/ApiClient.java` | 620 | 1 | 1 |

#### 5.1.2 方法名全集（65 个名字 / 101 处声明）

`accountPermissionUpdateForCli` · `approveProposalForCli` · `assetIssueForCli` · `broadcastTransactionForCli` · `callContractForCli` · `cancelAllUnfreezeV2ForCli` · `clearContractAbiForCli` · `clearWalletKeystoreForCli` · `clearWalletKeystoreTargetForCli` · `createAccountForCli` · `createAssetIssueForCli` · `createProposalForCli` · `CreateWalletFileForCli` · `createWitnessForCli` · `delegateResourceForCli` · `deleteProposalForCli` · `deployContractForCli` · `exchangeCreateForCli` · `exchangeInjectForCli` · `exchangeTransactionForCli` · `exchangeWithdrawForCli` · `freezeBalanceForCli` · `freezeBalanceV2ForCli` · `generateSubAccountForCli` · `getAccountNetForCli` · `getAccountResourceForCli` · `getAddressFromPrivateKeyForCli` · `getChainParametersForCli` · `getGasFreeInfoDataForCli` · `getMarketPairListForCli` · `getTransactionByIdForCli` · `getTransactionCountByBlockNumForCli` · `getTransactionInfoByIdForCli` · `getUnifiedPasswordCopyForCli` · `isControlledForCli` · `listWitnessesForCli` · `marketCancelOrderForCli` · `marketSellAssetForCli` · `modifyWalletNameForCli` · `participateAssetIssueForCli` · `processTransactionExtentionForCli` · `processTransactionForCli` · `registerWalletForCli` · `requireLoggedInWalletForCli` · `resetOrClearWalletForCli` · `resetWalletForCli` · `sendCoinForCli` · `setAccountIdForCli` · `signTransactionForCli` · `transferAssetForCli` · `triggerContractForCli` · `undelegateResourceForCli` · `unDelegateResourceForCli` · `unfreezeAssetForCli` · `unfreezeBalanceForCli` · `unfreezeBalanceV2ForCli` · `updateAccountForCli` · `updateAssetForCli` · `updateBrokerageForCli` · `updateEnergyLimitForCli` · `updateSettingForCli` · `updateWitnessForCli` · `voteWitnessForCli` · `withdrawBalanceForCli` · `withdrawExpireUnfreezeForCli`

> `undelegateResourceForCli`（小写 d）与 `unDelegateResourceForCli`（大写 D）**都真实存在**（后者见 `WalletApi.java:2636`），不是笔误。

#### 5.1.3 后缀不是判据 —— 18 个无 `ForCli` 后缀的 CLI-only 残留（D-10）

| 符号 | 位置 | 唯一调用方 | 备注 |
| --- | --- | --- | --- |
| `LAST_CLI_OPERATION_ERROR` + `recordLastCliOperationError` / `consumeLastCliOperationError` / `hasLastCliOperationError` / `clearLastCliOperationError` | `WalletApi.java:156`、`:1639-1659`；另 `WalletApiWrapper.java:460` 是转发用的 `consumeLastCliOperationError()` | **全部 49 处** `recordLastCliOperationError` 调用均在 `*ForCli` 内（grep 计 50 行，含 `:1653` 声明行） | 该机制存在意义就是喂 JSON 错误信封 |
| `gasFreeTransferOrThrow(...)` | `WalletApiWrapper.java:3195` | `cli/commands/TransactionCommands.java:445` | 唯一调用方 |
| `generateSubAccountOrThrow()` | `WalletApiWrapper.java:764` | `cli/commands/WalletCommands` | REPL 用非抛出版本 |
| `unlockOrThrow(long)` | `WalletApiWrapper.java:2677` | `cli/commands/**` | |
| `throwIfCliOperationFailed` / `throwCliError` / `validateCliWalletName` | `WalletApiWrapper.java:444`+`:452`（两个重载）、`:464`、`:849` | 仅 `*ForCli` | `cli/` 与 `Client.java` 引用均为 0 |
| `getGasFreeInfoData(String)` | `WalletApiWrapper.java:3011-3095`（**85 行**） | 仅 `getGasFreeInfoDataForCli` | 全仓库无其他调用方 |
| `gasFreeTraceData(String)` | `WalletApiWrapper.java:3405-3429` | `cli/commands/QueryCommands.java:1033` | |
| `getUSDTBalanceExact(byte[])` | `WalletApiWrapper.java:2350-2371` | `cli/commands/QueryCommands.java:207` | 另有 1 处测试引用 |
| `WalletApi.extractTransactionReturnMessage(...)` | `WalletApi.java:1661-1676` | 仅 5 个 `*ForCli`（`:1204,3674,3851,4021,4498`） | |
| `WalletApi.WalletCreationResult.getMnemonicKeystoreName()` + `mnemonicKeystoreName` 字段 | `WalletApi.java:207,209,211,218-219`；**删字段还须同步改 `:365`/`:440`（局部声明）、`:376`/`:380`/`:445`/`:451`（4 处赋值）与 `:395`/`:454`（2 参构造调用）** | 主源码读点仅 `WalletApiWrapper:199`（`registerWalletForCli` 内）与 `:833`（`generateSubAccountForCli` 内），另 `cli/commands/WalletCommands:69,377` | 两个读点都随 `*ForCli` 消失 |
| `printMnemonicPath` 形参 | `WalletApi.java:362,376,380,408,411,437,445,451` | 随上一行一并恒定 | **与 §5.1.4 同类**：删除后恒为 `true`，按 `true` 折叠 `:411` 守卫并删形参 |
| `lastGasFreeId`（字段） | `WalletApiWrapper.java:134` | 唯一读点 `:3200` 在 `gasFreeTransferOrThrow` 内 | **删除该字段** |
| `lastSendResult`（字段） | `LedgerEventListener.java:31`（声明）、`:42`（读）、`:95`/`:98`（写）——**共 4 处** | 唯一读点是 `getLastSendResultBytes()`（`LedgerEventListener.java:41`，见 §5.2） | **删除该字段** |
| `CliWalletCreationResult`（内部类） | `WalletApiWrapper.java:138`（`:145` 是其构造器） | `cli/commands/WalletCommands` | |
| `WalletApi.passwordValidQuiet(char[])` | `WalletApi.java:2074` | `WalletApiWrapper.java:186`（在 `registerWalletForCli` 内） | |
| `ClearWalletUtils.deleteFilesQuiet(...)` | `ClearWalletUtils.java:101` | `resetOrClearWalletForCli`（`WalletApiWrapper:2760,2788`） | 删后 `ClearWalletUtilsTest` 成孤儿 |
| `GasFreeApi.getMessageOrThrow(...)` | `GasFreeApi.java:279`（`:266` 注释自陈「…the standard CLI path」） | `WalletApiWrapper.java:3240`（静态 import 在 `:28`） | 仅经 ForCli GasFree 分支可达 |
| `WalletApiWrapper.setWallet`（Lombok `@Setter` `:127`） | `WalletApiWrapper.java:127` | 主源码仅 `StandardCliRunner:215` | **依 D12 删除**（删后仅测试 `:168` 使用） |
| `triggerConstantContractExtention` · `estimateEnergyMessage` | `WalletApiWrapper.java:2295-2313` · `:2385-2406` | 移除后 REPL 不可达，仅剩测试 | **依 D12 连同测试删除** |

#### 5.1.4 `standardCli` 布尔参数

`WalletApiWrapper.gasFreeTransferInternal(String, long, boolean standardCli)`（`:3203`）内含 **12 处** `standardCli` 条件分支（`:3206, 3213, 3223, 3239, 3243, 3265, 3290, 3327, 3337, 3354, 3361, 3366`，其中 `:3239` 为三元表达式、`:3337` 为 `if (!standardCli)`；连声明共 13 处提及）。

**还有一处 CLI-only 残留，它不含 `standardCli` 字样，因此既不在上述 13 处之内、也抓不到**——`WalletApiWrapper.java:3248-3251`：

```java
} catch (IllegalStateException e) {
  // Only reachable via getMessageOrThrow (standard CLI); REPL's getMessage swallows internally.
  throw new CommandErrorException("query_failed", e.getMessage());
}
```

`gasFreeTransferInternal` **在移除后存活**（REPL 经 `gasFreeTransfer:3188` 可达）。只折叠 12 个分支而漏掉这个 catch，会在一个 REPL 可达方法里留下 `CommandErrorException` 引用——**这正是 §5.0 要消除的依赖**。

**处置（顺序固定，因为 §5.2 与本节行号区间重叠）**：

1. **先执行 §5.2** —— 整块删除 `:3290-3301` 的 Ledger 分支（该区间含本节列举的 `:3290`）；
2. **再折叠剩余 11 处**（`:3206, 3213, 3223, 3239, 3243, 3265, 3327, 3337, 3354, 3361, 3366`），按 `standardCli == false` 求值；
3. **删除 `:3248-3251` 的整个 catch 子句**（随 `getMessageOrThrow` 一并）——`:3248` 是 `} catch (IllegalStateException e) {` 本身，**只删 3249-3251 会留下悬空的 catch 头**；
4. 删除 `standardCli` 形参，同步修正 `gasFreeTransfer:3189` 与 `gasFreeTransferOrThrow:3198` 的调用。

#### 5.1.5 执行程序

不可批量正则删。按以下顺序：

1. **先做 §5.0**（commit 1 已完成）。
2. 删除 65 个 `*ForCli` **名字**对应的全部方法体——注意「65」是去重后的名字数，**实际声明有 101 处**（`WalletApiWrapper` 55 + `WalletApi` 45 + `ApiClient` 1），含重载与跨类同名。
3. 删除 §5.1.3 表列的 **18 个符号**。
4. 折叠 §5.1.4 的 `standardCli` 参数与 catch 子句。
5. **机械化找剩余孤儿**——对 `WalletApiWrapper` / `WalletApi` 每个 `private` 成员执行：

   ```bash
   # 主源码引用数（人工剔除声明行）——src/test 的引用不计入（决策 D12）
   grep -rn "\b<symbol>\b" --include="*.java" src/main
   ```

   > **规则（D12）**：**只数 `src/main`**。`triggerConstantContractExtention`、`estimateEnergyMessage`、`setWallet` 都因「仅剩测试引用」而计数不归零——按本规则一律**连同测试删除**。测试不是使用者。

6. 反向确认交互路完好：

   ```bash
   grep -oE "walletApiWrapper\.[a-zA-Z0-9_]+" src/main/java/org/tron/walletcli/Client.java | sort -u
   ```
   逐个确认仍存在于 `WalletApiWrapper`。

> **注意——仓库存在与本次移除无关的既有死代码**：`WalletApi.java` 中约 28 个零调用方方法（`create*Contract` 家族 `:1928-3476`、`jsonStr2ABI`/`getEntryType`/`getStateMutability` `:3230-3396`、`selectFullNode:310`、`selcetMnemonicFile:754`、`getRpcVersion:346`、`getPrivateBytes:543`、`transferTE:1431`、`triggerCallContract:3526`）与 `GasFreeApi.abiEncodeCall:60`。**不是本次移除的产物，不在本次范围内**（CLAUDE.md「只清理自己造成的孤儿」）。第 5 步的扫描会扫到它们——**不要删**。

> **风险**：这是整个移除里最容易删出回归的一步。`./gradlew build` 通过**不等于**交互式 shell 没坏（共用辅助被误删且签名相同时，编译期查不出）。验收以 §9.2 手工走查为准。

### 5.2 Ledger 归属（§12.3-1 的实际结论）

**实测事实**：

- `org.tron.ledger` 是**独立 24 文件包**，与 `cli/` 无依赖。
- **交互式 shell 已有完整 Ledger 支持**：`Client.java:113-115` 引入 `TronLedgerGetAddress` / `TransactionSignManager` / `LedgerUserHelper`；`:228` 注册菜单项 `ImportWalletByLedger`；`:500-542` 实现 `importWalletByLedger()`；`:3742` 有 `ledgerUserForbid()` 门禁。
- `WalletApiWrapper` 亦直接使用 `org.tron.ledger.*`（`:103-110`、`:255`、`:387`、`:395`）。
- Standard CLI 专属的**只有非交互签名适配层** `cli/ledger/`(6 文件)。理由见 `WalletApi.java:1076` 原注释：*「Standard CLI uses a non-interactive signer; REPL never reaches signTransactionForCli」*。

**结论**：§12.3-1 的二选一**不适用**。正确处置：

| 动作 | 位置 |
| --- | --- |
| 删除非交互适配层 | `cli/ledger/` 全 6 文件（其中 `LedgerSigner` / `LedgerSignOutcome` 已在 commit 2.5 迁出，随 3b 删） |
| 删除字段 | `walletserver/WalletApi.java:**180-187**` —— javadoc 起于 `:180` 的 `/**`（`:181-183` 正文、`:184` `*/`），**Lombok `@Getter`/`@Setter` 在 `:185-186`**，字段在 `:187`。`WalletApiWrapper:131`/`:3291` 调用的正是这两个生成的访问器，**从 `:181` 起删会留下未闭合的 `/**`，只删 `:187` 会编译失败** |
| 删除签名方法 | `walletserver/WalletApi.java:1056-1140` `signTransactionForCli()` **整个方法**（ledger 分支在 `:1079-1096`，含 `:1084` 的 `CommandErrorException`）及其 2 处调用（`:1222`、`:1267`） |
| 删除 setter | `walletcli/WalletApiWrapper.java:129-133` `setLedgerSigner(...)` |
| 删除 GasFree 签名分支 | `walletcli/WalletApiWrapper.java:**3290-3301**`（注意 `:3299` 的 `throw new CommandErrorException(...)` 也在此区间内，勿切短）；**另见 §5.1.4 的 11 处 `standardCli` 分支** |
| 清理 `LedgerEventListener` 残留 | `ledger/listener/LedgerEventListener.java`：`:33` `@Setter private volatile boolean standardCliQuiet`（setter 仅被 `ProductionLedgerPorts:97,108` 调用）、`:41` `getLastSendResultBytes()`（仅被 `ProductionLedgerPorts:114` 读取）、`:31/:42/:95/:98` 的 `lastSendResult`、`:200,237` 赋值、`:241,247,253` 三处输出守卫折叠为恒真 |
| **保留** | `org.tron.ledger` **全部 24 个文件均保留**（仅 `LedgerEventListener` 内部删字段/折叠守卫，不删文件）、`Client.java` 全部 Ledger 代码、`WalletApiWrapper` 面向交互路的 Ledger 方法 |

> 注意：`LedgerEventListener` 确有 Standard-CLI-only 成员，但它删不删都能编译——**这正是它容易被漏掉的原因**。
>
> **折叠输出守卫的两个注意点**（都不影响编译，最易出错）：
> - `:200,237` 的 `standardCliQuiet = false;` 分别位于 `doLedgerSignEnd()` 与超时路径内——**删字段时不要把周围的清理逻辑一并带走**；`:241,247,253` 折叠为恒真（REPL 下该字段本就恒为 `false`，输出不变）。
> - `WalletApiWrapper.java:3337` 是 `if (!standardCli) { System.out.println("GasFreeTransfer result: …") }`，折叠后变成无条件打印。**这是 REPL 的一行输出**，行为不变但守卫消失——须在折叠中明确保留该 `println`。

**release note 措辞**：**不能**写「Java 版不再支持 Ledger」（不实）。正确表述：**「Java 版仍支持 Ledger，但仅限交互式 shell；随 Standard CLI 一并移除的是非交互（脚本 / CI）Ledger 签名能力，该场景请改用 TS 版。」**

### 5.3 alias 功能取消（决策 D7 / D8）

**范围（实测，`cli/` 包外零引用；`Client.java` 唯一一处 alias 是 `:4878` 的 `AliasCommands.register(registry)`，位于 Standard CLI 的 `initRegistry()` 内）**：

| 项 | 位置 |
| --- | --- |
| Java（10） | `cli/aliases/`（8 文件）+ `cli/ActiveWalletConfig` + `cli/commands/AliasCommands` |
| **资源（3，git 追踪）** | `src/main/resources/aliases/main.json` · `nile.json` · `shasta.json`（由 `AliasStoreLoader.java:38` 的 `"/aliases/" + networkName(network) + ".json"` 加载） |
| 测试（6） | `ActiveWalletConfigTest` · `ParsedOptionsAliasTest` · `aliases/*Test`（5） |
| QA | `java/qa/commands/alias.sh` |
| 命令（4） | `alias-add` · `alias-remove` · `alias-list` · `alias-resolve` |
| **落盘用户数据** | `<cwd>/Wallet/.active-wallet`（`ActiveWalletConfig.java:22-27`）· `<cwd>/Wallet/aliases/<network>.json`（`AliasStoreLoader.java:121`） |

> **REPL 完全不使用 alias**：全部消费方（`StandardCliRunner:103,158-160` 构造 resolver、`ParsedOptions:109-112` 解析choke point、`CommandDefinition:97`、`CommandContext`、`AliasCommands`）都在 `cli/` 内。REPL 从不构造 `AliasResolver`，也从不调用 `loadLayered`/`loadUser`。

**必须完成**：

1. release note 的 breaking changes **与 Standard CLI 移除并列**列出 alias 取消，不能只算作副作用；
2. **`Wallet/` 扫描加固（D8）**——`WalletApi.java:688` 与 `:747` 现为
   ```java
   File[] wallets = file.listFiles((dir, name) -> !name.equals(".active-wallet"));
   ```
   该过滤器**只按文件名跳过 `.active-wallet`，不排除子目录**，因此遗留的 `Wallet/aliases/` 目录会作为条目进入 REPL 的编号钱包选择器、计入 `wallets.length`、可被选中并在按 keystore 解析时失败（D-17）。
   **两处各加一行**：过滤掉目录（并可一并跳过 `aliases`）。
   > **`.active-wallet` 过滤器保留不动**——它虽是 Standard CLI 时代的产物，却是唯一挡住该文件污染选择器的东西，**不得作为「CLI 残留」清理**（§5.5 已据此调整）。
3. release note 告知用户：可自行删除 `Wallet/aliases/` 与 `Wallet/.active-wallet`；本版**不主动删除**用户目录下的文件。

### 5.4 `MASTER_PASSWORD` 环境口令通道删除（D-11 / D-14 / 决策 D10）

**实测状态更正（D-14）**：该分支**今天就已不可达**。Standard CLI 走自己的取密码路径——`StandardCliRunner:61-65` 的 `defaultProvider` 直接 `System.getenv("MASTER_PASSWORD")`（`--password-stdin` 优先），**不经** `Utils.inputPassword`。而 `Utils` 的分支由 `isEnvPasswordInputEnabled()` 把关：

```
Utils.java:127  private static final ThreadLocal<Boolean> ENV_PASSWORD_INPUT_ENABLED
Utils.java:342  if (isEnvPasswordInputEnabled()) {
Utils.java:343    char[] envPassword = resolveEnvPassword(System.getenv("MASTER_PASSWORD"), checkStrength);
Utils.java:379  static char[] resolveEnvPassword(...)
Utils.java:392  setEnvPasswordInputEnabled(boolean)
Utils.java:400  isEnvPasswordInputEnabled()  →  Boolean.TRUE.equals(ENV_PASSWORD_INPUT_ENABLED.get())
```

`setEnvPasswordInputEnabled` **全仓库只有测试调用**（`UtilsPasswordTest:42,48,50`、`StandardCliRunnerTest:302,310`），生产代码从不启用它 → ThreadLocal 恒为 `null` → 分支恒不进入。

**它是休眠通道，不是活通道**——但 `Utils.inputPassword()` 正是 **REPL 的口令提示路径**，只要有人日后调用那个 setter，`MASTER_PASSWORD` 就会在 REPL 提示路径中被读取。

**处置（D10）**：删除

- `:342-347` 的分支；
- `resolveEnvPassword`（`:379`）、`setEnvPasswordInputEnabled`（`:392`）、`isEnvPasswordInputEnabled`（`:400`）；
- `:127` 的 `ENV_PASSWORD_INPUT_ENABLED` ThreadLocal；
- `common/utils/UtilsPasswordTest` **整个文件**（5 个用例全部依赖上述 API）。

理由：与 §12「REPL 只从 TTY 提示取秘密」的目标一致，且是自包含的小改动，消除一条潜伏的凭据路径。

### 5.5 遗留注释清理

以下注释在移除后会指向不存在的东西，编译无碍但会误导：

`WalletApi.java:181`（"Set by `StandardCliRunner`…"，**随 §5.2 的 `:180-187` 在 3b 一并消失**）· `WalletApi.java:1076` · `WalletApiWrapper.java:3193`（**随 `gasFreeTransferOrThrow` 在 3b 消失**）· `WalletApiWrapper.java:3249` · `Client.java:4841`（`// Standard CLI mode`）· `Client.java:4856` · `GasFreeApi.java:266,278` · `LedgerEventListener.java:37-38`

> **不在本清单内**：`WalletApi.java:688`/`:747` 的 `.active-wallet` 过滤器。它虽属 Standard CLI 时代产物，但按 D8 **必须保留并加固**（§5.3）。

---

## 6. QA 体系删除（决策 D9）

**实测更正（D-13）**：`java/qa/` 的**被测对象只有 Standard CLI**——`lib/cli.sh:733` 拼 `java -jar "$WALLET_JAR" "$@"`，`:770-776` 追加 `--network`/`--output json`。`manifest.tsv` 共 **103 个用例**，分类为 `noauth-success`(49) / `stateful-success`(21) / `auth-success`(13) / `expected-execution-error`(8) / `expected-usage-error`(5) / `offline-success`(4) / `stateful-replay-execution`(2) / `noauth-help`(1)，**没有任何交互式用例**。

> 因此**删除 `qa/` 不会损失任何 REPL 覆盖率——它从来就没有**。所谓「text/json 比对」是 Standard CLI 自身两种输出模式互比，不是 REPL 与 Standard CLI 互比。`CLAUDE.md:98` 的描述是错的，须一并更正（§7.2）。

| 项 | 位置 |
| --- | --- |
| shell 体系（11 文件） | `java/qa/`：`run.sh` · `task_runner.sh` · `config.sh` · `manifest.tsv` · `contracts.tsv` · `wallet-cli-runtime` · `commands/alias.sh` · `lib/cli.sh` · `lib/report.sh` · `lib/semantic.sh` · `lib/case_resolver.py` |
| QA 工具类（2） | `src/test/java/org/tron/qa/QARunner.java`（依赖 `CommandDefinition`/`CommandRegistry` `:3-4`，9 处 register `:57-65`）· `QASecretImporter.java`（依赖 `ActiveWalletConfig` `:9`、`WalletApi.CreateWalletFileForCli` `:75`） |
| gradle 任务 **2 个** | `build.gradle:154-161` `qaJar` · `build.gradle:163-168` `qaRun`（`mainClass = 'org.tron.qa.QARunner'`） |
| `.gitignore` | `java/.gitignore:22-25`：`qa/results/` · `qa/runtime/` · `qa/report.txt` · `qa/.verify.lock/` |
| 文档 | 根 `CLAUDE.md:96-107` 「QA Verification」整节 |

**不建替代**：移除后 Java 版**没有自动化 E2E 校验**——这与移除前**一致**（D-13），不是回归。存活的单元测试有 13 个类（crypto / keystore / 格式化 / safe mode / 重写后的 `ClientMainTest` 等）。commit 3b 的删除风险由 §9.2 手工走查承担。此事实须写入 `CLAUDE.md`。

> **CI 无影响**：`.github/workflows/` 三个 workflow 中，`build-artifact.yml` 跑 `./gradlew clean build shadowJar shadowDistZip`（会编译测试，由 §9 覆盖），`ts-ci.yml` / `ts-standalone-release.yml` 为 TS 专用。**没有任何 workflow 调用 `qa/run.sh`、`qaJar` 或 Standard CLI**，无需改 CI。

---

## 7. 文档处置

### 7.1 删除

`java/docs/standard-cli-contract-spec.md`。（§12.2 列的另外 4 篇在仓库中不存在，无需处理。）

> 注意：该文件也是 `--interactive` 全仓库唯一的文档。因 D13 已决定移除该 flag，不存在「文档随之消失」的问题。

### 7.2 改写

| 文件 | 需改内容（行号已实测校正） |
| --- | --- |
| 根 `CLAUDE.md` | **`:80-82`** Build & Run 下的 `# Run in standard CLI mode` 示例块（`:82` 为 `--output json` 调用）；**`:96-107`** QA Verification 整节删除，并**更正其中「compare interactive REPL output vs standard CLI」的错误描述**（D-13），改为说明 Java 版无自动化 E2E 校验；**`:112-118`**「Two CLI Modes」改为单一交互模式，并注明启动方式只有裸 `java -jar wallet-cli.jar`；**`:119-128`**「Standard CLI Contract」整节删除（含 `:126-127` 的「source of truth」段）；`:132-133` Request Flow 的 Standard CLI 链路；**`:142-145`** Key Classes 四条（`StandardCliRunner` · `CommandRegistry` · `CommandDefinition` · `OutputFormatter`）；`:150-156`「Adding a New Standard CLI Command」整节；`:162-163` 包表两行 |
| 根 `README.md` | 实测**已**描述 Java 为 "An interactive prompt only"（`:17`、`:24-28`），`:18` 措辞复核即可，基本 no-op |
| `java/README.md` | 实测 `grep -i standard` **零命中**，无 Standard CLI 用法可删。启动方式（`:46`、`:61`）本就是裸 `java -jar wallet-cli.jar`，与 D13 后的行为一致，**无需改动** |
| `ts/docs/superpowers/plans/2026-07-07-…md:756,759`、`.../specs/2026-07-07-…md:325` | 指示后续跑 `qa/run.sh verify` 的历史流程文档，加一行失效说明（可选） |

### 7.3 新增

**无。** 决策 D2 取消命令映射表，原计划的 `java/docs/standard-cli-to-ts-migration.md` 不再产出。

---

## 8. 交付物

> §12 原定四件，其中两件依 §0.4 决策不执行（映射表 D2、major 跳跃 D3）。以下为实际交付。

### 8.1 ~~命令映射表~~ —— 不产出（决策 D1 + D2）

不做 TS 覆盖审计，不产出 107 条映射表，不设覆盖闸门。原 §8.1 的验收脚本一并取消。

> 记录在案：Standard CLI 实测 **107 个命令名** + **102 处别名声明**
> （`grep -rhoE '\.name\("[^"]+"\)' src/main/java/org/tron/walletcli/cli/commands/ | sed 's/.*("//;s/")//' | sort -u | wc -l` → 107；
> `grep -rhoE '\.aliases\("[^"]+"' … | sort -u | wc -l` → 102）。
> TS 侧为**层级式**命名空间（`tx send` / `stake delegate` / `wallet import ledger`），与 Java 的**扁平** 107 名不同构，数量对比无意义——这也是不做逐条比对的一个理由。

### 8.2 版本号（决策 D3）

- **改这一处**：`common/utils/Utils.java:141` — `public static final String VERSION = " v4.12.0";` → **`" v4.13.0"`**。
- 与 TS 版（`ts/package.json` 亦为 4.12.0 → 4.13.0）保持锁步。
- **放弃 §12 的 major 跳跃要求**：这意味着按 semver 范围或 lockfile 锁定的构建**不会**被主版本号挡住。触达职责因此完全落在 §3.3 兜底提示与 §8.3 release note 上。
- `build.gradle:22` 的 `version '1.0-SNAPSHOT'` 与发布版本号无关，**不要动**。
- 交互式 shell 的 `Version` 命令（`Client.java:3666`）与 §3.2 的 `--version` 自动跟随该常量。

### 8.3 Release note（决策 D14）—— 完整 breaking changes 清单

因映射表与 major 跳跃均不执行，**release note 是最主要的触达渠道**。必须包含：

1. **Standard CLI 移除** → 非交互 / 脚本 / CI 场景改用 TS 版 `@tron-walletcli/wallet-cli`；
2. **alias 功能取消**（`alias-add` / `alias-remove` / `alias-list` / `alias-resolve`）；
3. **`--interactive` 移除** —— REPL 启动方式回归裸 `java -jar wallet-cli.jar`；
4. **`MASTER_PASSWORD` 环境变量口令通道移除**；
5. **非交互（脚本 / CI）Ledger 签名能力移除** —— 措辞见 §5.2，**不得**写成「Java 版不再支持 Ledger」，交互式 shell 的 Ledger 支持完整保留；
6. **遗留数据**：用户可自行删除 `Wallet/aliases/` 与 `Wallet/.active-wallet`；
7. 版本号说明：`v4.13.0`，与 TS 版锁步，**非** major 跳跃。

渠道：GitHub Release note + Discussions 置顶帖 + 官方开发者渠道，随本版**同步**发出。

### 8.4 启动兜底提示

见 §3.3。**验收**：

```bash
java -jar build/libs/wallet-cli.jar get-account --address T…      # 一行提示 + exit 2
java -jar build/libs/wallet-cli.jar --output json get-account …   # 一行提示 + exit 2，且非 JSON 信封
java -jar build/libs/wallet-cli.jar --interactive                 # 一行提示 + exit 2（D13 已移除该 flag）
java -jar build/libs/wallet-cli.jar --version                     # "wallet-cli v4.13.0"，exit 0
java -jar build/libs/wallet-cli.jar                               # 进入交互式 shell
```

---

## 9. 执行顺序与验收

### 9.0 【关键】`cli/` 与主源码是循环依赖

**实测依赖是双向的**：

| 方向 | 实测 |
| --- | --- |
| `cli/` → 主源码 | `cli/` 内有 **55 处** `*ForCli` 调用（`TransactionCommands` 13 · `StakingCommands` 10 · `QueryCommands` 9 · `WalletCommands` 5 · `ExchangeCommands` 5 · `ContractCommands` 5 · `WitnessCommands` 4 · `ProposalCommands` 3 · `ledger/LedgerSigner` 1），另有 8 处调用 §5.1.3/§5.2 的符号（`StandardCliRunner:216` → `setLedgerSigner`、`TransactionCommands:445` → `gasFreeTransferOrThrow`、`ProductionLedgerPorts:97,108,114` 等） |
| 主源码 → `cli/` | `WalletApi.java:187,1080,1082` 与 `WalletApiWrapper.java:129,3291,3296,3298` 引用 `cli.ledger.LedgerSigner` / `LedgerSignOutcome`（§4.1） |

先删 `cli/` → 主源码断；先删 `*ForCli` → `cli/` 断。**重排解决不了。**

**决策 D11 的破环办法**：新增 **commit 2.5**，把 `LedgerSigner` / `LedgerSignOutcome` **临时迁出** `cli/` 到中立包。两侧都改为引用新包后，主源码 → `cli/` 方向即被切断，于是原本必须原子的巨型提交可拆为 3a / 3b。这两个类型最终在 **3b** 随 §5.2 一并删除。

### 9.1 提交顺序（6 个提交，每个都能 `./gradlew build` 通过）

| # | 动作 | 验收 |
| --- | --- | --- |
| **1** | **§5.0** 迁移 `CommandErrorException` → `org.tron.core.exception`。五个改动点缺一不可（`WalletApiWrapper:119` import、`WalletApi:1084` 全限定名、`StandardCliRunner:138` 同包裸名、4 个测试文件、`GasFreeApi:278` 注释） | `./gradlew build`；§4.1 泄漏脚本 = 16 行 |
| **2** | **§3** 改写 `Client.java`（删 4 import、删 3 个辅助方法、删 `:68-69` 孤儿 import、按 §3.2 白名单重写 `runMain`、加 §3.3 兜底）**＋同 commit 改写 `ClientMainTest`**（`compileJava` 不编译测试源集，分开做会让测试树坏几个 commit） | `./gradlew build`；手工验证 §8.4 五条；泄漏脚本 = 3 行 |
| **2.5** | **§9.0** 把 `cli/ledger/LedgerSigner`、`LedgerSignOutcome` 迁出 `cli/` 到中立包，两侧改引用（**破环**） | `./gradlew build`；泄漏脚本 = 1 行（仅剩两处注释） |
| **3a** | **批量删除（机械）**：`cli/` 整包 39 文件 + 19 个测试类 + `src/test/java/org/tron/qa/`（2 文件）+ alias 3 个 json 资源。约 **11,900 行** | `grep -rn "walletcli\.cli" --include="*.java" src/` 零命中；`./gradlew build`；泄漏脚本 = 0 行 |
| **3b** | **外科手术（高风险）**：65 个 `*ForCli`（101 处声明）+ §5.1.3 的 18 个符号 + §5.1.4 的 `standardCli` 折叠（含 `:3248-3251` catch）+ §5.2 的 Ledger 注入点与 `LedgerEventListener` 残留 + 2.5 迁出的两个类型 + 改写 `WalletApiWrapperTest` / `WalletApiTest` | `grep -rn "ForCli" --include="*.java" src/` 零命中；§9.3 第三道闸；`./gradlew build` |
| **4** | **§6** 删 QA shell 体系：`java/qa/`、`qaJar` 与 `qaRun`、`.gitignore:22-25` | `./gradlew build`；`./gradlew tasks \| grep -E "qaJar\|qaRun"` 无输出 |
| **5** | **§5.4** 删环境口令通道 + `UtilsPasswordTest`；**§5.3** `WalletApi:688,747` 加目录过滤；**§5.5** 注释清理；**§7** 文档；**§8.2** 版本号 → `v4.13.0`；**§8.3** release note | `./gradlew build`；§9.3 收尾检查；§9.2 手工走查 |

> 3a 与 3b 的分界是刻意的：3a 是**纯批删**，diff 大但无判断；3b 是**判断密集**的外科手术，diff 小但风险高。两者分开后可分别评审，且回归可用 bisect 定位到正确的一侧。

### 9.2 移除后的手工回归走查（Java 版无自动化 E2E，见 §6）

`./gradlew build` 通过**不等于**交互式 shell 没坏。发版前必须手工走查：

- 钱包生命周期：`RegisterWallet` / `ImportWallet` / `ImportWalletByMnemonic` / `Login` / `Logout` / `BackupWallet` / `ChangePassword` / `ClearWalletKeystore`；
- **Ledger 路径**：`ImportWalletByLedger` + 一笔 Ledger 签名转账（3b 动过注入点与 `LedgerEventListener`，**必测**）；
- **USDT 余额**：`getUSDTBalance` 路径（commit 1 动过其异常类，**必测**）；
- **GasFree**：§5.1.4 折叠了 12 处 `standardCli` 分支与一个 catch（**必测**）；
- **口令提示**：`RegisterWallet` / `Login` / `ChangePassword` 的密码输入（§5.4 动过 `Utils.inputPassword`，**必测**）；
- **钱包选择器**：在 `Wallet/` 下放一个子目录后启动，确认不再出现在编号列表中（§5.3 的 D8 加固，**必测**）；
- 交易：`SendCoin` / `TransferAsset` / `TriggerContract` / `DeployContract`；
- 质押：`FreezeBalanceV2` / `UnfreezeBalanceV2` / `DelegateResource` / `WithdrawExpireUnfreeze`；
- 多签：`AccountPermissionUpdate` + co-sign 广播；
- 查询：`GetAccount` / `GetTransactionById` / `GetChainParameters`；
- 入口：§8.4 五条。

### 9.3 收尾检查

```bash
cd java
grep -rn "walletcli\.cli" --include="*.java" src/                    # 期望：零（现基线 209）
grep -rn "ForCli"         --include="*.java" src/                    # 期望：零（现基线 348）

# 第三道闸：抓无 ForCli 后缀的残留（§5.1.3 / §5.1.4）——前两条 grep 抓不到它们
grep -rnE "OrThrow|CliOperation|LAST_CLI|throwCliError|CliWallet|standardCli|passwordValidQuiet|deleteFilesQuiet|getGasFreeInfoData|gasFreeTraceData|getUSDTBalanceExact|extractTransactionReturnMessage|[Ll]astGasFreeId|[Ll]astSendResult|[Mm]nemonicKeystoreName|printMnemonicPath|setWallet" \
     --include="*.java" src/main                                     # 现基线 317；期望：仅剩确认保留项（§5.1.5 判定为共用的辅助）

grep -rn "EnvPasswordInput\|resolveEnvPassword" --include="*.java" src/   # 期望：零（§5.4）
grep -rn "aliases\|ActiveWalletConfig" --include="*.java" src/main        # 期望：零（§5.3）
ls src/main/resources/aliases 2>/dev/null && echo "ALIAS RESOURCES STILL PRESENT"  # 期望：无输出

test ! -d qa && echo "qa removed"                                    # 用 test，不用 ls（ls 缺目录会报错而非干净失败）
./gradlew tasks | grep -E "qaJar|qaRun"                              # 期望：无输出
```

---

## 10. 决策记录

**全部 13 项阻塞项已于 2026-08-27 拍板，无待裁决项。** 完整决策见 **§0.4**；对 §12 的两处显式偏离（不做映射表、不做 major 跳跃）见 **§0.3**；决策评审过程中发现的 5 项事实更正见 **§0.1 的 D-13 ~ D-17**。

实施过程中若出现 §0.4 未覆盖的新判断，按以下既定原则处理：

| 原则 | 出处 |
| --- | --- |
| 引用计数**只数 `src/main`**，测试引用不计；计数归零则连同测试一并删除 | D12 · §5.1.5 |
| 既有死代码（与本次移除无关的零调用方法）**不删** | §5.1.5 注 |
| 任何触及交互路的改动须能对应到 §0.2 表中的授权项 | §0.2 |
| Ledger 相关表述**不得**写成「Java 版不再支持 Ledger」 | §5.2 · §8.3-5 |
