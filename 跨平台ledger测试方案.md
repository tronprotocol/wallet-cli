# 跨平台 Ledger 本地测试方案

文档版本：1.3
制定日期：2026-07-29
被测版本：`wallet-cli 0.2.0` / Git tag `ts-v0.2.0`
测试结论口径：macOS、Linux、Windows 三个平台全部通过后，`ts-v0.2.0` 才可作为支持物理 Ledger 的社区版本发布。

## 1. 测试目标与边界

本方案验证 GitHub Release 中的 TypeScript 独立执行文件能直接访问同一台物理 Ledger，不依赖用户安装 Node.js、npm 或项目源码。测试覆盖：

- Release 归档的 SHA-256、GitHub artifact attestation 和 CLI 版本；
- 原生 HID 设备发现、断开、重连和独占访问；
- 固定 BIP32 路径的地址派生及三平台一致性；
- TIP-191 消息签名的批准、拒签和超时；
- 超时后 HID handle 是否释放，下一条命令能否立即使用设备；
- TIP-712 的 `Sign by Hash` 设置门控及签名；
- Nile 原生 TRX 交易构建和 Ledger `--sign-only`，全程不广播；
- 错误码、退出码和 JSON 输出在三平台是否一致。

本地物理设备放行只覆盖以下三个主流社区资产：

| 平台 | 本地物理测试资产 | 放行方式 |
|---|---|---|
| macOS arm64 | `wallet-cli-0.2.0-macos-arm64.tar.gz` | 本方案全量测试 |
| Linux x64 | `wallet-cli-0.2.0-linux-x64.tar.gz` | 本方案全量测试 |
| Windows x64 | `wallet-cli-0.2.0-windows-x64.zip` | 本方案全量测试 |
| macOS x64 | `wallet-cli-0.2.0-macos-x64.tar.gz` | GitHub Actions 构建和嵌入式 Ledger addon 冒烟 |
| Linux arm64 | `wallet-cli-0.2.0-linux-arm64.tar.gz` | GitHub Actions 构建和嵌入式 Ledger addon 冒烟 |

不使用 WSL、Docker、Whisky、虚拟机 USB 透传或 Speculos 代替三台物理主机。它们可以用于启动和 native addon 冒烟，但会引入虚拟化、Wine 或 USB/IP 转译层，无法证明社区用户直接运行 Release 二进制时的行为。

### 1.1 Docker、Whisky 与原生环境的等效性

| 环境 | `--version` / `--help` | native addon 加载 | 物理 Ledger 签名 | 发布门禁资格 |
|---|---:|---:|---:|---:|
| macOS 原生 | 是 | 是 | 是 | `MAC-A64` |
| Docker Desktop / macOS | 是 | 是 | USB/IP 下仅作诊断 | 无 |
| Whisky / macOS | 是 | Wine 下仅作诊断 | 不可信 | 无 |
| 原生 Linux 上的 Docker Engine | 是 | 是 | `hidraw` 透传下仅作补充诊断 | 无 |
| Ubuntu 原生 | 是 | 是 | 是 | `LINUX-X64` |
| Windows 原生 | 是 | 是 | 是 | `WIN-X64` |

Docker/Whisky 测试结果只能标记为 `SMOKE_PASS` 或 `SMOKE_FAIL`，不能写成平台 `PASS`。以下场景允许使用：

- Docker Desktop：验证 Linux ELF、x64 baseline、glibc 闭包、嵌入式 Linux `node-hid` addon 和无设备错误路径；
- Whisky：验证 Windows PE 能启动、帮助和参数解析，不验证 Windows HID、驱动或 DLL 的原生行为；
- 原生 Linux Docker：辅助定位 `hidraw`、容器权限或 native addon 问题；最终必须在同一 Ubuntu 主机上由普通用户直接运行 Release 二进制。

#### Docker Desktop / macOS 冒烟

将 Linux x64 Release 解压后，设置归档目录并运行：

```bash
LINUX_PACKAGE="${PWD}/wallet-cli-0.2.0-linux-x64"

docker run --rm \
  --platform linux/amd64 \
  --volume "${LINUX_PACKAGE}:/opt/wallet-cli:ro" \
  ubuntu:22.04 \
  /opt/wallet-cli/wallet-cli --version
```

预期 stdout 严格为 `0.2.0`。继续验证 embedded Ledger addon 能加载：

```bash
set +e
docker run --rm \
  --platform linux/amd64 \
  --volume "${LINUX_PACKAGE}:/opt/wallet-cli:ro" \
  --env WALLET_CLI_HOME=/tmp/wallet-cli-home \
  ubuntu:22.04 \
  /opt/wallet-cli/wallet-cli import ledger \
    --app tron \
    --path "m/44'/195'/0'/0/0" \
    --timeout 5000 \
    -o json \
  > docker-linux-x64-no-device.json
RC=$?
set -e

test "${RC}" -eq 1
grep -q '"code":"auth_required"' docker-linux-x64-no-device.json
```

Docker Desktop 不支持直接 USB passthrough；USB/IP 需要额外转发层，而且 Docker 不保证所有 USB 设备兼容。因此不得用 USB/IP 结果替代 `LINUX-X64`。测试流程不要求配置 USB/IP，也不允许为了本门禁启动 `--privileged` 容器。

#### Whisky / macOS 冒烟

在 Whisky bottle 中添加 `wallet-cli.exe`，只执行：

```powershell
wallet-cli.exe --version
wallet-cli.exe --help
wallet-cli.exe import ledger `
  --app tron `
  --path "m/44'/195'/0'/0/0" `
  --timeout 5000 `
  -o json
```

前两条命令应成功；第三条只记录 Wine 下的 addon/无设备行为，不要求把错误归因到 Windows。证据 ID 必须使用 `WIN-X64-WHISKY-SMOKE`。Whisky 已停止维护并处于只读归档状态，不能承担 Windows 发布门禁。

#### 原生 Linux Docker 补充诊断

在 Ubuntu 实体机上先确定 Ledger 对应的 `hidraw`，不得把所有 USB 设备交给容器：

```bash
lsusb -d 2c97:
ls -l /dev/hidraw*
udevadm info --query=property --name=/dev/hidraw3 | grep 'ID_VENDOR_ID=2c97'
```

确认 `/dev/hidraw3` 是本轮 Ledger 后，使用精确设备路径：

```bash
LEDGER_HID=/dev/hidraw3
LINUX_PACKAGE="${PWD}/wallet-cli-0.2.0-linux-x64"

docker run --rm -it \
  --device "${LEDGER_HID}:${LEDGER_HID}:rw" \
  --volume "${LINUX_PACKAGE}:/opt/wallet-cli:ro" \
  --env WALLET_CLI_HOME=/tmp/wallet-cli-home \
  ubuntu:22.04 \
  /opt/wallet-cli/wallet-cli import ledger \
    --app tron \
    --path "m/44'/195'/0'/0/0" \
    --label ledger-e2e \
    -o json
```

`hidraw` 编号可能在重连后变化，每次运行前必须重新核对 Vendor ID。容器内 root 访问还会掩盖普通用户的 udev 权限问题；完成诊断后必须退出容器，在同一 Ubuntu 上直接执行：

```bash
"${LINUX_PACKAGE}/wallet-cli" import ledger \
  --app tron \
  --path "m/44'/195'/0'/0/0" \
  --label ledger-e2e \
  -o json
```

## 2. 固定测试矩阵

三个环境均使用实体机、原生 USB 端口和原生 shell。补丁版本与内核版本必须由命令留档；不接受仅写“最新版”。

| ID | 操作系统 | CPU | Shell | Release 资产 | 关键系统组件 |
|---|---|---|---|---|---|
| `MAC-A64` | macOS 15.7 Sequoia | Apple Silicon arm64 | zsh 5.9 | `macos-arm64.tar.gz` | Darwin 24.x、系统 HID、`codesign` |
| `LINUX-X64` | Ubuntu Desktop 22.04.5 LTS | x86_64 | Bash 5.1.16 | `linux-x64.tar.gz` | glibc 2.35、Linux 6.8.x、Ledger udev rule |
| `WIN-X64` | Windows 11 Pro 24H2，OS Build 26100 | x86_64 | PowerShell 5.1 主门禁；另测 cmd、PowerShell 7、Windows Terminal、Git Bash | `windows-x64.zip` | Windows HID、PnP、Console/ConPTY |

测试辅助工具固定为：

| 工具 | 版本 | 用途 | 是否为 `wallet-cli` 运行依赖 |
|---|---:|---|---|
| GitHub CLI | 2.76.2 | 验证 GitHub artifact attestation | 否 |
| `curl` | macOS/Ubuntu 系统版本 | 下载 Release | 否 |
| `jq` | 1.6，仅 Ubuntu | 解析测试结果 | 否 |
| PowerShell `ConvertFrom-Json` | 5.1 | 解析 Windows 测试结果 | 否 |

项目把 Bun `1.3.14` 固定在 [`ts/package.json`](ts/package.json) 的 `devDependencies` 和 lockfile 中；本地及 GitHub Actions 都通过 `npm ci` 获得同一构建器，不依赖全局 Bun。生成的 runtime 已嵌入二进制，社区测试机不需要安装 Node.js、Bun 或 npm。

维护者在源码目录执行以下自检；不得用全局 `bun` 替代项目锁定版本：

```bash
cd ts
npm ci
npm exec -- bun --version
npm run build:standalone
node scripts/verify-standalone.mjs standalone/wallet-cli
```

`npm exec -- bun --version` 必须输出 `1.3.14`。Windows 将最后一个路径改为
`standalone/wallet-cli.exe`。若 `npm run build:standalone` 报
`bun: command not found`，说明当前 `node_modules` 未按 lockfile 安装完整 devDependencies；
重新执行不带 `--omit=dev` 或 `NODE_ENV=production` 的 `npm ci`，不接受临时全局安装作为修复。

## 3. Ledger 与链上测试数据

### 3.1 固定硬件

| 项目 | 固定值 |
|---|---|
| 设备 | Ledger Nano S Plus，同一台设备依次连接三台测试机 |
| 连接 | 原装或确认支持数据传输的 USB 线，直连主机，不经过 Hub |
| 钱包 | 专用测试助记词，禁止使用持有主网资产的设备 |
| Ledger Device OS | 测试前通过 Ledger Wallet 读取并填入报告；三平台必须是同一数值 |
| TRON app | 测试前从设备 `TRON > Settings > Version` 读取并填入报告；三平台必须是同一数值 |
| 派生路径 | `m/44'/195'/0'/0/0` |
| 本地账户标签 | `ledger-e2e` |
| USB Vendor ID | `2c97` |

Ledger Device OS 和 TRON app 的实际版本是物理设备状态，不能从 Release 二进制推断。测试报告中的这两个字段为空，整轮结果按 `BLOCKED` 处理。TRON app 必须支持 `signTIP712HashedMessage`；不支持时 CLI 应返回 `ledger_unsupported`，不得跳过 TIP-712 用例后放行。

### 3.2 固定链和签名数据

| 数据 | 固定值 |
|---|---|
| 网络 | `tron:nile` |
| 消息 | `wallet-cli-ledger-xplat-v0.2.0\|path=m/44'/195'/0'/0/0\|nonce=20260728` |
| TIP-712 Domain | `{"name":"SunPerp","version":"1","chainId":728126428}` |
| TIP-712 Primary Type | `Order` |
| TIP-712 Message | `{"trader":"TW7xMzawfuGcowC3rYN1qPnvrkrxVVMive","size":"1000000"}` |
| TIP-712 预期 digest | `0xfeef6c51405bf7a1a385dcae577c465497ab98e5012546ee6c1df80acd734c80` |
| 交易收款人 | Ledger 自身的 index 0 地址，由 `T02` 产生 |
| 交易金额 | `1 SUN`，即 `0.000001 TRX` |
| 交易模式 | `--sign-only`，禁止 broadcast |
| 正常设备超时 | `60000 ms` |
| 超时测试值 | `3000 ms` |

TIP-712 的 `trader` 是固定测试载荷，不要求等于 Ledger 签名地址。预期 digest 由当前锁定的 `tronweb 6.4.0` 按 [`ts/src/adapters/outbound/ledger/index.ts`](ts/src/adapters/outbound/ledger/index.ts) 第 223—228 行的实际路径计算；不能使用旧命令文档中的示例 digest。该用例验证固定 payload 的 digest、设备设置门控和签名路径。

### 3.3 前置状态

执行前必须满足：

1. `ts-v0.2.0` Release 已包含五个归档和 `SHA256SUMS.txt`。
2. 同一台 Ledger Nano S Plus 已安装 TRON app，并记录 Device OS 与 app 版本。
3. index 0 地址已在 Nile 激活并至少持有 `1 TRX` 测试币。测试不广播，这项要求用于排除节点构建交易时的未激活账户差异。
4. Ledger Wallet、浏览器中的 TronScan/TronLink 页面以及其他可能访问 Ledger 的进程全部退出。
5. TRON app 的 `Sign by Hash` 初始状态为 `Not Allowed`。
6. 每个平台使用全新的 `WALLET_CLI_HOME`，不得复用日常钱包目录。

Linux 镜像需预装 [Ledger 官方 udev rules](https://github.com/LedgerHQ/udev-rules)。不要使用 `curl | sudo bash` 或 `wget | sudo bash`；规则文件应在镜像制作阶段审核后安装。测试前只做只读核对：

```bash
test -r /etc/udev/rules.d/20-hw1.rules
grep -q 'ATTRS{idVendor}=="2c97"' /etc/udev/rules.d/20-hw1.rules
ls -l /etc/udev/rules.d/20-hw1.rules
```

## 4. 平台准备与证据采集

所有命令从新的空目录执行，例如 `ledger-e2e-0.2.0`。结果统一保存在该目录的 `results` 子目录。

### 4.1 macOS 15.7 / arm64

记录环境：

```bash
sw_vers | tee macos-version.txt
uname -a | tee macos-kernel.txt
uname -m | tee macos-arch.txt
/bin/zsh --version | tee macos-shell.txt
gh --version | tee gh-version.txt
system_profiler SPUSBDataType > usb-before.txt
```

验收数据：

- `ProductVersion` 必须以 `15.7` 开头；
- `uname -m` 必须为 `arm64`；
- `gh --version` 第一行必须为 `gh version 2.76.2`。

下载、验证并解压：

```bash
set -eu
VERSION=0.2.0
PLATFORM=MAC-A64
ARCHIVE="wallet-cli-${VERSION}-macos-arm64.tar.gz"
BASE_URL="https://github.com/tronprotocol/wallet-cli/releases/download/ts-v${VERSION}"

mkdir -p downloads results
curl -fL "${BASE_URL}/${ARCHIVE}" -o "downloads/${ARCHIVE}"
curl -fL "${BASE_URL}/SHA256SUMS.txt" -o downloads/SHA256SUMS.txt
(
  cd downloads
  grep "  ${ARCHIVE}$" SHA256SUMS.txt | shasum -a 256 -c -
  gh attestation verify "${ARCHIVE}" --repo tronprotocol/wallet-cli
  tar -xzf "${ARCHIVE}"
)

WCLI="${PWD}/downloads/wallet-cli-${VERSION}-macos-arm64/wallet-cli"
TEST_HOME="${PWD}/test-home/${PLATFORM}"
RESULTS="${PWD}/results/${PLATFORM}"
mkdir -p "${TEST_HOME}" "${RESULTS}"
export WALLET_CLI_HOME="${TEST_HOME}"

file "${WCLI}" | tee "${RESULTS}/binary-file.txt"
codesign --verify --strict --verbose=2 "${WCLI}" 2> "${RESULTS}/codesign.txt"
"${WCLI}" --version | tee "${RESULTS}/cli-version.txt"
```

验收数据：

- `file` 包含 `Mach-O 64-bit executable arm64`；
- `codesign` 退出码为 `0`；
- CLI 输出严格等于 `0.2.0`。

### 4.2 Ubuntu Desktop 22.04.5 LTS / x86_64

记录环境：

```bash
cat /etc/os-release | tee ubuntu-version.txt
uname -a | tee ubuntu-kernel.txt
uname -m | tee ubuntu-arch.txt
bash --version | head -n 1 | tee ubuntu-shell.txt
ldd --version | head -n 1 | tee glibc-version.txt
jq --version | tee jq-version.txt
gh --version | tee gh-version.txt
lsusb -d 2c97: | tee usb-before.txt
```

验收数据：

- `/etc/os-release` 包含 `VERSION_ID="22.04"` 和 `VERSION="22.04.5 LTS (Jammy Jellyfish)"`；
- `uname -m` 为 `x86_64`；
- glibc 为 `2.35`；
- `jq-1.6`；
- GitHub CLI 第一行是 `gh version 2.76.2`；
- 连接设备后 `lsusb -d 2c97:` 至少输出一行。

下载、验证并解压：

```bash
set -eu
VERSION=0.2.0
PLATFORM=LINUX-X64
ARCHIVE="wallet-cli-${VERSION}-linux-x64.tar.gz"
BASE_URL="https://github.com/tronprotocol/wallet-cli/releases/download/ts-v${VERSION}"

mkdir -p downloads results
curl -fL "${BASE_URL}/${ARCHIVE}" -o "downloads/${ARCHIVE}"
curl -fL "${BASE_URL}/SHA256SUMS.txt" -o downloads/SHA256SUMS.txt
(
  cd downloads
  grep "  ${ARCHIVE}$" SHA256SUMS.txt | sha256sum -c -
  gh attestation verify "${ARCHIVE}" --repo tronprotocol/wallet-cli
  tar -xzf "${ARCHIVE}"
)

WCLI="${PWD}/downloads/wallet-cli-${VERSION}-linux-x64/wallet-cli"
TEST_HOME="${PWD}/test-home/${PLATFORM}"
RESULTS="${PWD}/results/${PLATFORM}"
mkdir -p "${TEST_HOME}" "${RESULTS}"
export WALLET_CLI_HOME="${TEST_HOME}"

file "${WCLI}" | tee "${RESULTS}/binary-file.txt"
ldd "${WCLI}" | tee "${RESULTS}/ldd.txt"
"${WCLI}" --version | tee "${RESULTS}/cli-version.txt"
```

验收数据：

- `file` 包含 `ELF 64-bit` 和 `x86-64`；
- `ldd` 不得出现 `not found`；
- CLI 输出严格等于 `0.2.0`。

### 4.3 Windows 11 24H2 / x86_64

发布门禁的脚本化用例使用 Windows PowerShell 5.1，不使用 WSL。交互账户选择还必须完成下表的 shell 兼容测试：

| ID | Shell / 终端 | 最低记录版本 | 选择 index | 交互命令 |
|---|---|---|---:|---|
| `WIN-CMD` | Command Prompt (`cmd.exe`) | Windows 11 24H2 系统版本 | 0 | `wallet-cli.exe import ledger --app tron` |
| `WIN-PS51` | Windows PowerShell | 5.1 | 1 | `.\wallet-cli.exe import ledger --app tron` |
| `WIN-PS7` | PowerShell (`pwsh`) | 7.6.3 | 2 | `.\wallet-cli.exe import ledger --app tron` |
| `WIN-WT-PS7` | Windows Terminal + PowerShell 7 profile | Windows Terminal 1.24.11321.0、PowerShell 7.6.3 | 3 | `.\wallet-cli.exe import ledger --app tron` |
| `WIN-GITBASH` | Git Bash / MinTTY + ConPTY | Git for Windows 2.55.0(3) | 4 | `./wallet-cli.exe import ledger --app tron` |

Windows Terminal 是终端宿主，不是独立 shell；`WIN-WT-PS7` 用例验证 ConPTY 路径，不能代替
`WIN-PS7` 的传统控制台用例。Git for Windows 2.55.0(3) 使用直接 ConPTY 路径；旧版本若不能提供
raw TTY，可用 `winpty` 定位兼容问题，但回退结果不能替代主门禁。WSL 应运行 Linux x64 Release，
不执行 `wallet-cli.exe`，也不计入 `WIN-X64`。

记录环境：

```powershell
$Os = Get-CimInstance Win32_OperatingSystem
$Os | Select-Object Caption, Version, BuildNumber, OSArchitecture |
  Format-List | Out-File -Encoding utf8 windows-version.txt
$PSVersionTable | Out-File -Encoding utf8 powershell-version.txt
pwsh --version | Out-File -Encoding utf8 pwsh-version.txt
cmd /c ver | Out-File -Encoding utf8 cmd-version.txt
(Get-AppxPackage Microsoft.WindowsTerminal).Version | Out-File -Encoding utf8 windows-terminal-version.txt
git --version | Out-File -Encoding utf8 git-for-windows-version.txt
gh --version | Out-File -Encoding utf8 gh-version.txt
Get-PnpDevice -PresentOnly |
  Where-Object { $_.InstanceId -match 'VID_2C97' } |
  Format-List Status, Class, FriendlyName, InstanceId |
  Out-File -Encoding utf8 usb-before.txt
```

验收数据：

- `Version` 为 `10.0.26100`，`BuildNumber` 为 `26100`；
- `OSArchitecture` 为 `64-bit`；
- PowerShell `PSVersion` 以 `5.1` 开头；
- `pwsh --version` 严格为 `PowerShell 7.6.3`；
- Windows Terminal 版本严格为 `1.24.11321.0`；
- `git --version` 严格为 `git version 2.55.0.windows.3`；
- GitHub CLI 第一行是 `gh version 2.76.2`；
- 连接设备后存在 `VID_2C97` 且 `Status` 为 `OK`。

下载、验证并解压：

```powershell
$ErrorActionPreference = 'Stop'
$Version = '0.2.0'
$Platform = 'WIN-X64'
$Archive = "wallet-cli-$Version-windows-x64.zip"
$BaseUrl = "https://github.com/tronprotocol/wallet-cli/releases/download/ts-v$Version"

New-Item -ItemType Directory -Force downloads, results | Out-Null
Invoke-WebRequest "$BaseUrl/$Archive" -OutFile "downloads/$Archive"
Invoke-WebRequest "$BaseUrl/SHA256SUMS.txt" -OutFile 'downloads/SHA256SUMS.txt'

$ChecksumLine = Get-Content 'downloads/SHA256SUMS.txt' |
  Where-Object { $_ -match ([regex]::Escape($Archive) + '$') }
if (-not $ChecksumLine) { throw "missing checksum for $Archive" }
$Expected = ($ChecksumLine -split '\s+')[0].ToUpperInvariant()
$Actual = (Get-FileHash "downloads/$Archive" -Algorithm SHA256).Hash
if ($Actual -ne $Expected) { throw "SHA256 mismatch: expected=$Expected actual=$Actual" }

Push-Location downloads
try {
  gh attestation verify $Archive --repo tronprotocol/wallet-cli
  if ($LASTEXITCODE -ne 0) { throw 'attestation verification failed' }
  Expand-Archive -Path $Archive -DestinationPath .
} finally {
  Pop-Location
}

$Wcli = (Resolve-Path "downloads/wallet-cli-$Version-windows-x64/wallet-cli.exe").Path
$TestHome = Join-Path (Get-Location) "test-home/$Platform"
$Results = Join-Path (Get-Location) "results/$Platform"
New-Item -ItemType Directory -Force $TestHome, $Results | Out-Null
$env:WALLET_CLI_HOME = $TestHome

& $Wcli --version | Set-Content -Encoding utf8 "$Results/cli-version.txt"
if ($LASTEXITCODE -ne 0) { throw 'wallet-cli --version failed' }
Get-AuthenticodeSignature $Wcli |
  Format-List Status, StatusMessage, SignerCertificate |
  Out-File -Encoding utf8 "$Results/authenticode.txt"
```

验收数据：

- CLI 输出严格等于 `0.2.0`；
- SHA-256 和 GitHub attestation 均通过；
- 当前流水线未给 Windows PE 添加 Authenticode 签名，因此 `Status=NotSigned` 只做记录，不作为失败条件。若后续引入 Authenticode，本项必须升级为 `Status=Valid`。

## 5. 测试用例

三个平台按 `T00` 至 `T08` 顺序执行。每次只连接一台主机，不并行访问同一 Ledger。

### T00：无 Node/npm 运行时启动

目的：证明 Release 二进制不是依赖系统 Node.js 的启动脚本。

macOS 和 Linux：

```bash
env -i \
  PATH="/usr/bin:/bin:/usr/sbin:/sbin" \
  WALLET_CLI_HOME="${WALLET_CLI_HOME}" \
  "${WCLI}" --version > "${RESULTS}/T00-version.txt"
test "$(cat "${RESULTS}/T00-version.txt")" = "0.2.0"
```

Windows：

```powershell
$SavedPath = $env:Path
try {
  $env:Path = "$env:SystemRoot\System32;$env:SystemRoot"
  $Output = & $Wcli --version
  $Rc = $LASTEXITCODE
  $Output | Set-Content -Encoding utf8 "$Results/T00-version.txt"
  if ($Rc -ne 0 -or $Output.Trim() -ne '0.2.0') {
    throw 'T00 failed'
  }
} finally {
  $env:Path = $SavedPath
}
```

通过标准：退出码 `0`，stdout 为 `0.2.0`，没有 `node not found`、DLL 缺失或动态库缺失。

### T01：未连接设备

操作：拔掉 Ledger USB 线。

macOS 和 Linux：

```bash
STARTED_AT="$(date +%s)"
set +e
"${WCLI}" import ledger \
  --app tron \
  --path "m/44'/195'/0'/0/0" \
  --label ledger-e2e \
  --timeout 5000 \
  -o json \
  > "${RESULTS}/T01-no-device.json" \
  2> "${RESULTS}/T01-no-device.stderr.log"
RC=$?
set -e
ELAPSED="$(( $(date +%s) - STARTED_AT ))"
test "${RC}" -eq 1
grep -q '"code":"auth_required"' "${RESULTS}/T01-no-device.json"
test "${ELAPSED}" -le 8
```

Windows：

```powershell
$StartedAt = Get-Date
$Output = & $Wcli import ledger `
  --app tron `
  --path "m/44'/195'/0'/0/0" `
  --label ledger-e2e `
  --timeout 5000 `
  -o json `
  2> "$Results/T01-no-device.stderr.log"
$Rc = $LASTEXITCODE
$Elapsed = ((Get-Date) - $StartedAt).TotalSeconds
$Output | Set-Content -Encoding utf8 "$Results/T01-no-device.json"
$Json = ($Output -join "`n") | ConvertFrom-Json
if ($Rc -ne 1 -or $Json.error.code -ne 'auth_required' -or $Elapsed -gt 8) {
  throw 'T01 failed'
}
```

通过标准：退出码 `1`、`error.code=auth_required`、8 秒内退出，不创建 Ledger 账户。

### T02：固定路径导入与幂等性

操作：

1. 连接并解锁 Ledger；
2. 打开 TRON app；
3. 确认 Ledger Wallet 和浏览器钱包已经完全退出。

macOS 和 Linux：

```bash
"${WCLI}" import ledger \
  --app tron \
  --path "m/44'/195'/0'/0/0" \
  --label ledger-e2e \
  --timeout 60000 \
  -o json \
  > "${RESULTS}/T02-import.json" \
  2> "${RESULTS}/T02-import.stderr.log"

"${WCLI}" import ledger \
  --app tron \
  --path "m/44'/195'/0'/0/0" \
  --label ledger-e2e \
  --timeout 60000 \
  -o json \
  > "${RESULTS}/T02-import-repeat.json" \
  2> "${RESULTS}/T02-import-repeat.stderr.log"

"${WCLI}" current -o json > "${RESULTS}/T02-current.json"

if [ "${PLATFORM}" = "MAC-A64" ]; then
  LEDGER_ADDRESS="$(/usr/bin/plutil -extract data.addresses.tron raw -o - "${RESULTS}/T02-import.json")"
else
  LEDGER_ADDRESS="$(jq -r '.data.addresses.tron' "${RESULTS}/T02-import.json")"
fi
printf '%s\n' "${LEDGER_ADDRESS}" > "${RESULTS}/ledger-address.txt"

grep -q '"status":"created"' "${RESULTS}/T02-import.json"
grep -q '"status":"existing"' "${RESULTS}/T02-import-repeat.json"
grep -q '"type":"ledger"' "${RESULTS}/T02-import.json"
grep -q "\"path\":\"m/44'/195'/0'/0/0\"" "${RESULTS}/T02-import.json"
grep -Eq '^T[1-9A-HJ-NP-Za-km-z]{33}$' "${RESULTS}/ledger-address.txt"
```

Windows：

```powershell
$Output = & $Wcli import ledger `
  --app tron `
  --path "m/44'/195'/0'/0/0" `
  --label ledger-e2e `
  --timeout 60000 `
  -o json `
  2> "$Results/T02-import.stderr.log"
if ($LASTEXITCODE -ne 0) { throw 'T02 first import failed' }
$Output | Set-Content -Encoding utf8 "$Results/T02-import.json"
$Import = ($Output -join "`n") | ConvertFrom-Json

$RepeatOutput = & $Wcli import ledger `
  --app tron `
  --path "m/44'/195'/0'/0/0" `
  --label ledger-e2e `
  --timeout 60000 `
  -o json `
  2> "$Results/T02-import-repeat.stderr.log"
if ($LASTEXITCODE -ne 0) { throw 'T02 repeat import failed' }
$RepeatOutput | Set-Content -Encoding utf8 "$Results/T02-import-repeat.json"
$Repeat = ($RepeatOutput -join "`n") | ConvertFrom-Json

$CurrentOutput = & $Wcli current -o json
if ($LASTEXITCODE -ne 0) { throw 'T02 current failed' }
$CurrentOutput | Set-Content -Encoding utf8 "$Results/T02-current.json"

$LedgerAddress = $Import.data.addresses.tron
$LedgerAddress | Set-Content -Encoding ascii "$Results/ledger-address.txt"
if (
  $Import.data.status -ne 'created' -or
  $Repeat.data.status -ne 'existing' -or
  $Import.data.type -ne 'ledger' -or
  $Import.data.path -ne "m/44'/195'/0'/0/0" -or
  $LedgerAddress -notmatch '^T[1-9A-HJ-NP-Za-km-z]{33}$'
) {
  throw 'T02 assertion failed'
}
```

通过标准：

- 首次导入为 `created`，重复导入为 `existing`；
- `type=ledger`，路径严格等于固定路径；
- 地址为 34 位 TRON Base58 地址；
- 本地目录中没有助记词或私钥字段；
- 三个平台最终记录的地址逐字符相同。

### T02-WIN：Windows 多 shell 交互账户选择

目的：验证 Windows executable 在不同控制台宿主中都能进入 Ledger account selector，不会静默
回退到 index `0`。保持 Ledger 已解锁并打开 TRON app，分别打开全新的 shell 窗口执行以下单行命令：

Command Prompt：

```bat
set "WALLET_CLI_HOME=%USERPROFILE%\.wallet-cli-ledger-e2e\WIN-SHELLS" && wallet-cli.exe import ledger --app tron
```

Windows PowerShell 5.1：

```powershell
$env:WALLET_CLI_HOME="$env:USERPROFILE\.wallet-cli-ledger-e2e\WIN-SHELLS"; .\wallet-cli.exe import ledger --app tron
```

PowerShell 7：

```powershell
$env:WALLET_CLI_HOME="$env:USERPROFILE\.wallet-cli-ledger-e2e\WIN-SHELLS"; .\wallet-cli.exe import ledger --app tron
```

Windows Terminal 的 PowerShell 7 profile：

```powershell
$env:WALLET_CLI_HOME="$env:USERPROFILE\.wallet-cli-ledger-e2e\WIN-SHELLS"; .\wallet-cli.exe import ledger --app tron
```

Git Bash：

```bash
WALLET_CLI_HOME="$USERPROFILE\\.wallet-cli-ledger-e2e\\WIN-SHELLS" ./wallet-cli.exe import ledger --app tron
```

仅当直接命令不能获得 raw TTY 时，额外执行
`WALLET_CLI_HOME="$USERPROFILE\\.wallet-cli-ledger-e2e\\WIN-SHELLS" winpty ./wallet-cli.exe import ledger --app tron`
并记录 Git for Windows、MinTTY 和 `winpty --version`；该结果用于诊断，不替代直接 ConPTY 用例。

五个 shell 必须使用同一个绝对 `WALLET_CLI_HOME`，按矩阵分别选择 index `0` 至 `4`。每次
导入后立即在当前 shell 执行 `wallet-cli list`；最后再回到五个 shell 各执行一次 `list`，
确认它们读取的是同一个 `wallets.json`，且都能看到五个 Ledger 账户。禁止使用相对路径或
按 shell 拆分根目录，否则只能验证选择器，不能验证跨 shell 账户合并。

通过标准：

- 五个用例都显示 `Select tron account (Up/Down, Enter)`；
- 首屏均显示 index `0` 至 `4`，向下越过末项时能继续加载下一页；
- 最终 `list` 在五个 shell 中均显示 index `0` 至 `4` 的五条 Ledger 记录；
- 五个 shell 输出的账户 ID、path 和 address 集合逐字符一致；
- 本地只存在一个共享的 `wallets.json`，路径为 `%USERPROFILE%\.wallet-cli-ledger-e2e\WIN-SHELLS\wallets.json`；
- 不出现 `tty_required`，也不能在没有选择动作时直接导入 index `0`；
- pipe 和 stdin 重定向不计入交互测试；脚本使用场景必须显式传 `--index`、`--path` 或 `--address`。

### T03：TIP-191 消息签名成功与拒签

先执行批准路径。操作员在设备上核对这是消息签名请求后批准。

macOS 和 Linux：

```bash
MESSAGE="wallet-cli-ledger-xplat-v0.2.0|path=m/44'/195'/0'/0/0|nonce=20260728"

"${WCLI}" message sign \
  --message "${MESSAGE}" \
  --network tron:nile \
  --account ledger-e2e \
  --timeout 60000 \
  -o json \
  > "${RESULTS}/T03-message-approved.json" \
  2> "${RESULTS}/T03-message-approved.stderr.log"

grep -q "\"address\":\"${LEDGER_ADDRESS}\"" "${RESULTS}/T03-message-approved.json"
grep -Eq '"signature":"0x[0-9a-fA-F]{130}"' "${RESULTS}/T03-message-approved.json"
```

Windows：

```powershell
$Message = "wallet-cli-ledger-xplat-v0.2.0|path=m/44'/195'/0'/0/0|nonce=20260728"
$Output = & $Wcli message sign `
  --message $Message `
  --network tron:nile `
  --account ledger-e2e `
  --timeout 60000 `
  -o json `
  2> "$Results/T03-message-approved.stderr.log"
if ($LASTEXITCODE -ne 0) { throw 'T03 approve failed' }
$Output | Set-Content -Encoding utf8 "$Results/T03-message-approved.json"
$Approved = ($Output -join "`n") | ConvertFrom-Json
if (
  $Approved.data.address -ne $LedgerAddress -or
  $Approved.data.signature -notmatch '^0x[0-9a-fA-F]{130}$'
) {
  throw 'T03 approve assertion failed'
}
```

再执行拒签路径。设备出现确认请求后选择 Reject。

macOS 和 Linux：

```bash
set +e
"${WCLI}" message sign \
  --message "${MESSAGE}" \
  --network tron:nile \
  --account ledger-e2e \
  --timeout 60000 \
  -o json \
  > "${RESULTS}/T03-message-rejected.json" \
  2> "${RESULTS}/T03-message-rejected.stderr.log"
RC=$?
set -e
test "${RC}" -eq 1
grep -q '"code":"signing_rejected"' "${RESULTS}/T03-message-rejected.json"
```

Windows：

```powershell
$Output = & $Wcli message sign `
  --message $Message `
  --network tron:nile `
  --account ledger-e2e `
  --timeout 60000 `
  -o json `
  2> "$Results/T03-message-rejected.stderr.log"
$Rc = $LASTEXITCODE
$Output | Set-Content -Encoding utf8 "$Results/T03-message-rejected.json"
$Rejected = ($Output -join "`n") | ConvertFrom-Json
if ($Rc -ne 1 -or $Rejected.error.code -ne 'signing_rejected') {
  throw 'T03 reject failed'
}
```

通过标准：

- 批准路径退出码 `0`，签名为 `0x` 加 130 个十六进制字符；
- signer address 等于 `T02` 地址；
- 拒签路径退出码 `1`，错误码严格为 `signing_rejected`；
- 拒签后进程立即退出，设备可接收下一条命令。

### T04：3 秒超时与 HID handle 释放

设备出现消息签名请求后不做任何操作。

macOS 和 Linux：

```bash
STARTED_AT="$(date +%s)"
set +e
"${WCLI}" message sign \
  --message "${MESSAGE}" \
  --network tron:nile \
  --account ledger-e2e \
  --timeout 3000 \
  -o json \
  > "${RESULTS}/T04-timeout.json" \
  2> "${RESULTS}/T04-timeout.stderr.log"
RC=$?
set -e
ELAPSED="$(( $(date +%s) - STARTED_AT ))"
test "${RC}" -eq 1
grep -q '"code":"timeout"' "${RESULTS}/T04-timeout.json"
test "${ELAPSED}" -le 8
```

Windows：

```powershell
$StartedAt = Get-Date
$Output = & $Wcli message sign `
  --message $Message `
  --network tron:nile `
  --account ledger-e2e `
  --timeout 3000 `
  -o json `
  2> "$Results/T04-timeout.stderr.log"
$Rc = $LASTEXITCODE
$Elapsed = ((Get-Date) - $StartedAt).TotalSeconds
$Output | Set-Content -Encoding utf8 "$Results/T04-timeout.json"
$TimedOut = ($Output -join "`n") | ConvertFrom-Json
if ($Rc -ne 1 -or $TimedOut.error.code -ne 'timeout' -or $Elapsed -gt 8) {
  throw 'T04 timeout failed'
}
```

超时后如果设备仍停留在旧提示，按 Reject 返回 TRON app。立即重复 `T03` 的批准命令，把结果写入 `T04-recovery.json`，不得拔线、重启设备或结束残留进程。

通过标准：

- 8 秒内以退出码 `1` 和 `error.code=timeout` 返回；
- 系统进程列表中没有残留 `wallet-cli`；
- 恢复命令一次成功，不出现 `resource busy`、`cannot open device` 或第二次超时。

该用例直接验证超时分支会关闭 HID transport；对应实现见 [`ts/src/adapters/outbound/ledger/index.ts`](ts/src/adapters/outbound/ledger/index.ts) 第 119—165 行。

### T05：TIP-712 设置门控与签名

固定 payload：

```text
{"domain":{"name":"SunPerp","version":"1","chainId":728126428},"types":{"Order":[{"name":"trader","type":"address"},{"name":"size","type":"uint256"}]},"message":{"trader":"TW7xMzawfuGcowC3rYN1qPnvrkrxVVMive","size":"1000000"}}
```

保持设备 `TRON > Settings > Sign by Hash > Not Allowed`。

macOS 和 Linux：

```bash
TYPED_DATA='{"domain":{"name":"SunPerp","version":"1","chainId":728126428},"types":{"Order":[{"name":"trader","type":"address"},{"name":"size","type":"uint256"}]},"message":{"trader":"TW7xMzawfuGcowC3rYN1qPnvrkrxVVMive","size":"1000000"}}'

set +e
"${WCLI}" typed-data sign \
  --typed-data "${TYPED_DATA}" \
  --network tron:nile \
  --account ledger-e2e \
  --timeout 60000 \
  -o json \
  > "${RESULTS}/T05-setting-blocked.json" \
  2> "${RESULTS}/T05-setting-blocked.stderr.log"
RC=$?
set -e
test "${RC}" -eq 1
grep -q '"code":"ledger_setting_required"' "${RESULTS}/T05-setting-blocked.json"
```

Windows：

```powershell
$TypedData = '{"domain":{"name":"SunPerp","version":"1","chainId":728126428},"types":{"Order":[{"name":"trader","type":"address"},{"name":"size","type":"uint256"}]},"message":{"trader":"TW7xMzawfuGcowC3rYN1qPnvrkrxVVMive","size":"1000000"}}'

$Output = & $Wcli typed-data sign `
  --typed-data $TypedData `
  --network tron:nile `
  --account ledger-e2e `
  --timeout 60000 `
  -o json `
  2> "$Results/T05-setting-blocked.stderr.log"
$Rc = $LASTEXITCODE
$Output | Set-Content -Encoding utf8 "$Results/T05-setting-blocked.json"
$Blocked = ($Output -join "`n") | ConvertFrom-Json
if ($Rc -ne 1 -or $Blocked.error.code -ne 'ledger_setting_required') {
  throw 'T05 setting gate failed'
}
```

在设备上改为 `TRON > Settings > Sign by Hash > Allowed`，重新打开 TRON app，执行批准路径。

macOS 和 Linux：

```bash
"${WCLI}" typed-data sign \
  --typed-data "${TYPED_DATA}" \
  --network tron:nile \
  --account ledger-e2e \
  --timeout 60000 \
  -o json \
  > "${RESULTS}/T05-typed-approved.json" \
  2> "${RESULTS}/T05-typed-approved.stderr.log"

grep -q "\"address\":\"${LEDGER_ADDRESS}\"" "${RESULTS}/T05-typed-approved.json"
grep -q '"primaryType":"Order"' "${RESULTS}/T05-typed-approved.json"
grep -q '"digest":"0xfeef6c51405bf7a1a385dcae577c465497ab98e5012546ee6c1df80acd734c80"' \
  "${RESULTS}/T05-typed-approved.json"
grep -Eq '"signature":"0x[0-9a-fA-F]{130}"' "${RESULTS}/T05-typed-approved.json"
```

Windows：

```powershell
$Output = & $Wcli typed-data sign `
  --typed-data $TypedData `
  --network tron:nile `
  --account ledger-e2e `
  --timeout 60000 `
  -o json `
  2> "$Results/T05-typed-approved.stderr.log"
if ($LASTEXITCODE -ne 0) { throw 'T05 approve failed' }
$Output | Set-Content -Encoding utf8 "$Results/T05-typed-approved.json"
$TypedApproved = ($Output -join "`n") | ConvertFrom-Json
if (
  $TypedApproved.data.address -ne $LedgerAddress -or
  $TypedApproved.data.primaryType -ne 'Order' -or
  $TypedApproved.data.digest -ne '0xfeef6c51405bf7a1a385dcae577c465497ab98e5012546ee6c1df80acd734c80' -or
  $TypedApproved.data.signature -notmatch '^0x[0-9a-fA-F]{130}$'
) {
  throw 'T05 approve assertion failed'
}
```

通过标准：

- 禁用时退出码 `1`，错误码严格为 `ledger_setting_required`；
- 允许后退出码 `0`，`primaryType=Order`；
- digest 严格等于固定预期值；
- signer address 等于 `T02` 地址；
- 签名格式正确。

用例完成后立即恢复 `Sign by Hash > Not Allowed`。该功能属于盲签：设备只能显示 domain separator 和 struct hash，不能显示完整字段，不应作为日常默认设置。对应实现见 [`ts/src/adapters/outbound/ledger/index.ts`](ts/src/adapters/outbound/ledger/index.ts) 第 76—105、209—241 行。

### T06：Nile 交易审核与 `sign-only`

该用例只构建和签名 `1 SUN` 自转账，不广播。

操作员在 Ledger 屏幕上核对：

- 网络流程为 TRON 交易签名；
- To 等于 `T02` 的 Ledger 地址；
- Amount 为 `0.000001 TRX`；
- 未出现未知合约或额外 data。

macOS 和 Linux：

```bash
"${WCLI}" tx send \
  --to "${LEDGER_ADDRESS}" \
  --raw-amount 1 \
  --network tron:nile \
  --account ledger-e2e \
  --sign-only \
  --timeout 60000 \
  -o json \
  > "${RESULTS}/T06-tx-sign-only.json" \
  2> "${RESULTS}/T06-tx-sign-only.stderr.log"

grep -q '"mode":"sign-only"' "${RESULTS}/T06-tx-sign-only.json"
grep -q '"rawAmount":"1"' "${RESULTS}/T06-tx-sign-only.json"
grep -q "\"to\":\"${LEDGER_ADDRESS}\"" "${RESULTS}/T06-tx-sign-only.json"
grep -q "\"address\":\"${LEDGER_ADDRESS}\"" "${RESULTS}/T06-tx-sign-only.json"
grep -Eq '"signature":\["[0-9a-fA-F]{130}"\]' "${RESULTS}/T06-tx-sign-only.json"
if grep -q '"stage":"submitted"' "${RESULTS}/T06-tx-sign-only.json"; then
  echo "unexpected broadcast stage" >&2
  exit 1
fi
```

Windows：

```powershell
$Output = & $Wcli tx send `
  --to $LedgerAddress `
  --raw-amount 1 `
  --network tron:nile `
  --account ledger-e2e `
  --sign-only `
  --timeout 60000 `
  -o json `
  2> "$Results/T06-tx-sign-only.stderr.log"
if ($LASTEXITCODE -ne 0) { throw 'T06 sign-only failed' }
$Output | Set-Content -Encoding utf8 "$Results/T06-tx-sign-only.json"
$Tx = ($Output -join "`n") | ConvertFrom-Json
if (
  $Tx.data.mode -ne 'sign-only' -or
  $Tx.data.rawAmount -ne '1' -or
  $Tx.data.to -ne $LedgerAddress -or
  $Tx.data.address -ne $LedgerAddress -or
  $Tx.data.signed.signature.Count -ne 1 -or
  $Tx.data.signed.signature[0] -notmatch '^[0-9a-fA-F]{130}$' -or
  $Tx.data.stage -eq 'submitted'
) {
  throw 'T06 assertion failed'
}
```

通过标准：

- 退出码 `0`；
- `mode=sign-only`，没有 `stage=submitted`；
- `rawAmount="1"`，to 和 signer 均为 Ledger 地址；
- `signed.signature` 只有一个 65-byte 十六进制签名；
- Nile 上没有产生交易。

交易中的 `ref_block`、timestamp 和 expiration 来自执行时的 Nile 链头，所以三平台的 txID 与交易签名不要求相同。验收比较其模式、金额、地址和签名结构。`--sign-only` 的输出契约见 [`ts/docs/commands/tx/send.md`](ts/docs/commands/tx/send.md) 第 82—95 行。

### T07：热插拔与恢复

1. 保持 TRON app 打开，拔掉 USB；
2. 执行一次 `T03` 消息签名，使用 `--timeout 5000`；
3. 要求退出码 `1`、`error.code=auth_required`，8 秒内退出；
4. 重新插入 USB、解锁、打开 TRON app；
5. 再执行一次 `T03` 批准路径，输出到 `T07-reconnected.json`。

通过标准：重连后一次成功，不需要重启 shell、主机或 Ledger；不得出现 `resource busy`。

### T08：三平台交叉一致性

把三个 `results/<PLATFORM>` 目录集中到同一台审查机，提取以下字段：

| 比较项 | `MAC-A64` | `LINUX-X64` | `WIN-X64` | 规则 |
|---|---|---|---|---|
| CLI version |  |  |  | 全部为 `0.2.0` |
| Ledger Device OS |  |  |  | 三列相同且非空 |
| TRON app version |  |  |  | 三列相同且非空 |
| BIP32 path |  |  |  | 全部为 `m/44'/195'/0'/0/0` |
| Ledger address |  |  |  | 三列逐字符相同 |
| TIP-191 message |  |  |  | 三列逐字节相同 |
| TIP-191 signature |  |  |  | 三列逐字符相同 |
| TIP-712 digest |  |  |  | 全部为固定 digest |
| TIP-712 signature |  |  |  | 三列逐字符相同 |
| T01 error |  |  |  | 全部为 `auth_required` |
| T03 reject error |  |  |  | 全部为 `signing_rejected` |
| T04 timeout error |  |  |  | 全部为 `timeout` |
| T05 setting error |  |  |  | 全部为 `ledger_setting_required` |
| T06 mode |  |  |  | 全部为 `sign-only` |

同一设备、相同 app 版本、相同路径和相同消息应产生一致的确定性签名。只有 Nile 交易因链头与时间字段变化而不比较 txID 和签名值。

## 6. 放行标准

Release 放行必须同时满足：

1. 三个平台的归档 SHA-256 和 GitHub attestation 全部验证成功。
2. `T00` 至 `T08` 全部通过，不允许把失败用例标记为“环境问题”后继续放行。
3. 三个平台的 Ledger 地址、TIP-191 签名、TIP-712 digest 与 TIP-712 签名一致。
4. 所有成功签名的 address 都等于缓存的 Ledger 地址；出现 `wrong_device_seed` 必须阻断发布。
5. 拒签、超时、设置缺失和无设备场景返回规定的退出码与错误码。
6. 超时、拒签、拔线后没有残留进程或被占用的 HID handle。
7. `T06` 只有 `sign-only` 结果，Nile 上没有广播记录。
8. 测试结束后 `Sign by Hash` 已恢复为 `Not Allowed`。
9. 测试证据中没有助记词、PIN、私钥或主网账户数据。
10. `MAC-A64`、`LINUX-X64`、`WIN-X64` 均来自原生实体机；Docker、Whisky、WSL、虚拟机和 USB/IP 结果不计入三平台通过数。
11. `WIN-CMD`、`WIN-PS51`、`WIN-PS7`、`WIN-WT-PS7`、`WIN-GITBASH` 的交互账户选择全部通过。

任一平台出现以下情况，发布状态为 `BLOCKED`：

| 现象 | 判定 |
|---|---|
| 设备在系统中可见，但 CLI 返回 `auth_required` | HID/udev/驱动或设备独占失败 |
| `ledger_unsupported` | TRON app 版本不满足当前功能集 |
| `wrong_device_seed` | 设备种子、passphrase 或缓存地址不一致 |
| 非预期 `ledger_setting_required` | 设备设置与用例前置状态不一致 |
| 超时后第二条命令 `resource busy` | HID handle 泄漏 |
| 三平台地址或确定性签名不同 | native addon、编码、app 或设备状态存在跨平台差异 |
| `T06` 出现 `stage=submitted` | 交易模式错误，有误广播风险 |
| Windows DLL、Linux shared object 或 macOS loader 缺失 | 独立执行文件未闭包运行依赖 |
| 任一 Windows shell 不显示账户选择器或静默选择 index 0 | Windows TTY/ConPTY 兼容回归 |
| 只有 Docker/Whisky 结果，没有对应原生实体机结果 | 目标平台 HID/驱动未经验证 |

## 7. 测试证据与报告

每个平台提交一个压缩包，目录结构如下：

```text
results/
├── MAC-A64/
│   ├── macos-version.txt
│   ├── binary-file.txt
│   ├── codesign.txt
│   ├── cli-version.txt
│   ├── T00-version.txt
│   ├── ledger-address.txt
│   ├── T01-no-device.json
│   ├── T02-import.json
│   ├── T02-import-repeat.json
│   ├── T03-message-approved.json
│   ├── T03-message-rejected.json
│   ├── T04-timeout.json
│   ├── T04-recovery.json
│   ├── T05-setting-blocked.json
│   ├── T05-typed-approved.json
│   ├── T06-tx-sign-only.json
│   └── T07-reconnected.json
├── LINUX-X64/
│   └── ...
└── WIN-X64/
    └── ...
```

测试报告头必须填写：

```text
Release tag:
Release URL:
Git commit:
Tester:
Execution time (UTC):
Ledger model:
Ledger Device OS:
TRON app version:
Ledger USB VID/PID:
macOS exact version/build:
Ubuntu exact version/kernel/glibc:
Windows exact version/build:
MAC-A64 result: PASS / FAIL / BLOCKED
LINUX-X64 result: PASS / FAIL / BLOCKED
WIN-X64 result: PASS / FAIL / BLOCKED
Final decision: RELEASE / BLOCK
```

允许另附下列非门禁字段，但它们不影响 `Final decision`：

```text
DOCKER-LINUX-X64-SMOKE: SMOKE_PASS / SMOKE_FAIL / NOT_RUN
WIN-X64-WHISKY-SMOKE: SMOKE_PASS / SMOKE_FAIL / NOT_RUN
LINUX-X64-DOCKER-HID: SMOKE_PASS / SMOKE_FAIL / NOT_RUN
```

JSON 中的 Ledger 地址和签名不包含私钥，但会形成可关联的公开身份。证据包只进入项目发布审查记录，不直接附加到公开 Release。

## 8. 安全与成本权衡

- `+` 同一台物理 Ledger 保证种子、固件、app 和派生路径一致，能把变量集中到操作系统与 native HID 层。
- `+` `--sign-only` 覆盖真实交易审核和签名路径，同时消除误广播、Bandwidth 消耗及 Nile 链状态等待。
- `+` 隔离 `WALLET_CLI_HOME`，不会读取或修改测试人员的日常钱包数据。
- `+` 固定消息和 TIP-712 payload，可对三平台输出做逐字节比较。
- `+` 负向用例覆盖 `0x6985` 拒签、`0x6a8c` 设置缺失、设备缺失和 transport timeout。
- `+` Docker/Whisky 冒烟可以在借到目标实体机前发现 ELF/PE、架构、动态库和启动错误。
- `-` 三台物理主机串行执行，耗时高于 CI；这是验证真实 USB/HID 行为的必要成本。
- `-` Docker Desktop USB/IP 与 Whisky/Wine 都改变了 HID 调用路径，成功或失败均不能代表原生目标系统。
- `-` 原生 Linux Docker 中的 root/device 映射会掩盖普通用户的 udev 权限问题。
- `-` Windows 当前只有 SHA-256 和 GitHub attestation，没有 Authenticode；首次引入 PE 签名后应将其加入强制门禁。
- `-` macOS x64 与 Linux arm64 没有进入三平台物理 Ledger 门禁，仍依赖各自 runner 的 native addon 冒烟；若社区报告 HID 差异，应增加对应实体机。

## 9. 依据

- 发布矩阵、Bun 版本、归档、checksum 与 attestation：[`TypeScript Standalone Release`](.github/workflows/ts-standalone-release.yml)
- Ledger HID transport、错误分类和 handle 释放：[`ts/src/adapters/outbound/ledger/index.ts`](ts/src/adapters/outbound/ledger/index.ts)
- Ledger 导入输出：[`ts/docs/commands/import/ledger.md`](ts/docs/commands/import/ledger.md)
- Node.js TTY 能力判定与 `setRawMode`：[Node.js TTY](https://nodejs.org/api/tty.html)
- Windows Terminal/ConPTY 输入输出模型：[Microsoft Windows Pseudoconsoles](https://learn.microsoft.com/en-us/windows/console/pseudoconsoles)
- Git Bash/MinTTY 版本与 ConPTY 变更：[Git for Windows release notes](https://github.com/git-for-windows/build-extra/blob/main/ReleaseNotes.md)
- PowerShell 7.6.3：[PowerShell releases](https://github.com/PowerShell/PowerShell/releases)
- Windows Terminal 1.24.11321.0：[Windows Terminal releases](https://github.com/microsoft/terminal/releases)
- TIP-191 消息签名：[`ts/docs/commands/message/sign.md`](ts/docs/commands/message/sign.md)
- TIP-712 设置与 digest：[`ts/docs/commands/typed-data/sign.md`](ts/docs/commands/typed-data/sign.md)
- 交易 `sign-only` 输出：[`ts/docs/commands/tx/send.md`](ts/docs/commands/tx/send.md)
- Linux udev rules：[LedgerHQ/udev-rules](https://github.com/LedgerHQ/udev-rules)
- Ledger Wallet 三平台下载入口：[Ledger 官方下载页](https://www.ledger.com/ledger-live-download)
- Docker Desktop 不支持直接 USB passthrough：[Docker Desktop FAQ](https://docs.docker.com/desktop/troubleshoot-and-support/faqs/general/)
- Docker Desktop USB/IP 的限制与特权步骤：[Using USB/IP with Docker Desktop](https://docs.docker.com/desktop/features/usbip/)
- Docker `--device` 的设备映射与临时设备限制：[docker container run](https://docs.docker.com/reference/cli/docker/container/run/)
- Whisky 停止维护及归档状态：[Whisky-App/Whisky](https://github.com/Whisky-App/Whisky)
