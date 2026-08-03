#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "error: physical Ledger passthrough requires a Linux Docker host" >&2
  echo "Docker Desktop on macOS/Windows needs USB/IP; see docker/ledger/README.md" >&2
  exit 1
fi

if ! command -v udevadm >/dev/null 2>&1; then
  echo "error: udevadm is required to identify Ledger hidraw devices" >&2
  exit 1
fi

image="${WALLET_CLI_LEDGER_IMAGE:-wallet-cli-ledger:test}"
volume="${WALLET_CLI_LEDGER_VOLUME:-wallet-cli-ledger-data}"
declare -a device_args=()
declare -A added_gids=()

shopt -s nullglob
for device in /dev/hidraw*; do
  properties="$(udevadm info --query=property --name="${device}" 2>/dev/null || true)"
  if ! grep -qx 'ID_VENDOR_ID=2c97' <<< "${properties}"; then
    continue
  fi

  device_args+=(--device "${device}:${device}")
  gid="$(stat --format='%g' "${device}")"
  if [[ -z "${added_gids[${gid}]:-}" ]]; then
    device_args+=(--group-add "${gid}")
    added_gids[${gid}]=1
  fi
done

if (( ${#device_args[@]} == 0 )); then
  echo "error: no Ledger hidraw device (USB vendor 2c97) was found" >&2
  echo "unlock the device, open the TRON app, install Ledger udev rules, and reconnect it" >&2
  exit 1
fi

declare -a tty_args=(-i)
if [[ -t 0 && -t 1 ]]; then
  tty_args=(-it)
fi

exec docker run --rm "${tty_args[@]}" \
  "${device_args[@]}" \
  --mount "type=volume,source=${volume},target=/wallet-data" \
  "${image}" \
  "$@"

