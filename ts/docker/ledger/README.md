# Ledger transaction test container

This image builds the Linux standalone executable and its `node-hid` addon on Ubuntu 22.04, then runs it in a minimal Ubuntu 22.04 image with `libudev.so.1`. It is intended for disposable Ledger integration tests, not for holding software-wallet secrets.

## Build

Run from the repository root:

```bash
docker build \
  --file ts/docker/ledger/Dockerfile \
  --tag wallet-cli-ledger:test \
  ts
```

The image architecture follows the Docker host: `linux/amd64` builds `bun-linux-x64-baseline`; `linux/arm64` builds `bun-linux-arm64`.

## Physical Ledger on a Linux Docker host

Install the official [Ledger udev rules](https://github.com/LedgerHQ/udev-rules), reconnect the Ledger, unlock it, and open the TRON app. The helper detects only `/dev/hidraw*` nodes whose USB vendor ID is Ledger's `2c97`, forwards those nodes and their group IDs, and persists wallet metadata in the `wallet-cli-ledger-data` Docker volume. It does not use `--privileged`.

```bash
./ts/docker/ledger/run-linux.sh --version

./ts/docker/ledger/run-linux.sh \
  import ledger --app tron --index 0 --label docker-ledger
```

Test signing on Nile without broadcasting. Replace the recipient with an address you control:

```bash
./ts/docker/ledger/run-linux.sh \
  tx send \
  --network tron:nile \
  --account docker-ledger \
  --to T... \
  --amount 1 \
  --sign-only \
  --output json > ledger-sign-only.json

jq -e \
  'select(.schema == "wallet-cli.result.v1" and .success == true) |
   .data.mode == "sign-only" and (.data.signed.signature | length) > 0' \
  ledger-sign-only.json
```

`--sign-only` exercises RPC transaction construction, HID transport, on-device review, and Ledger signing, but cannot move funds. Broadcast only after inspecting the signed transaction:

```bash
jq -c \
  'select(.schema == "wallet-cli.result.v1" and .success == true) | .data.signed' \
  ledger-sign-only.json | \
  ./ts/docker/ledger/run-linux.sh \
    tx broadcast --tx-stdin --network tron:nile --output json --wait
```

The broadcast command is a real Nile transaction. Do not replace `tron:nile` with `tron:mainnet` during integration testing.

## macOS and Windows Docker Desktop

Docker Desktop does not expose host USB devices directly to Linux containers. A physical Ledger requires Docker Desktop's [USB/IP setup](https://docs.docker.com/desktop/features/usbip/) before a `/dev/hidraw*` node exists inside its Linux VM; the Linux helper cannot perform that host-level attachment.

For an existing Speculos emulator, the same image can use the project's HTTP transport without USB passthrough:

```bash
docker run --rm -it \
  --mount type=volume,source=wallet-cli-ledger-data,target=/wallet-data \
  --env SPECULOS_HOST=http://host.docker.internal \
  --env SPECULOS_PORT=5000 \
  wallet-cli-ledger:test \
  import ledger --app tron --index 0 --label speculos
```

`SPECULOS_PORT` selects the Speculos transport; without it, wallet-cli uses physical USB/HID.

## Cleanup

```bash
docker volume rm wallet-cli-ledger-data
docker image rm wallet-cli-ledger:test
```

Deleting the volume removes only container-side wallet metadata. Ledger private keys never leave the device.
