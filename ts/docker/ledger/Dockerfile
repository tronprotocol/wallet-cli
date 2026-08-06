# syntax=docker/dockerfile:1

# Node's bullseye build runs on Ubuntu 22.04 while the actual wallet executable and native HID
# addon are compiled against Ubuntu's glibc 2.35 baseline.
FROM node:20-bullseye-slim AS node-runtime

FROM ubuntu:22.04 AS build

ARG DEBIAN_FRONTEND=noninteractive
ARG TARGETARCH

COPY --from=node-runtime /usr/local/ /usr/local/

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
      ca-certificates \
      g++ \
      libudev-dev \
      libusb-1.0-0-dev \
      make \
      pkg-config \
      python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci

COPY LICENSE tsconfig.json ./
COPY scripts/ scripts/
COPY src/ src/

RUN case "${TARGETARCH}" in \
      amd64) target="bun-linux-x64-baseline" ;; \
      arm64) target="bun-linux-arm64" ;; \
      *) echo "unsupported Docker target architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && npm run build:standalone -- \
      --target "${target}" \
      --outfile standalone/wallet-cli \
    && node scripts/verify-standalone.mjs standalone/wallet-cli

FROM ubuntu:22.04 AS runtime

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
      ca-certificates \
      libudev1 \
      libusb-1.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 wallet \
    && useradd \
      --uid 10001 \
      --gid wallet \
      --home-dir /wallet-data \
      --no-create-home \
      --shell /usr/sbin/nologin \
      wallet \
    && install --directory --owner wallet --group wallet --mode 0700 /wallet-data

COPY --from=build /workspace/standalone/wallet-cli /usr/local/bin/wallet-cli
COPY --from=build /workspace/LICENSE /usr/share/doc/wallet-cli/LICENSE

ENV HOME=/wallet-data \
    WALLET_CLI_HOME=/wallet-data

VOLUME ["/wallet-data"]
USER wallet

ENTRYPOINT ["/usr/local/bin/wallet-cli"]
CMD ["--help"]

