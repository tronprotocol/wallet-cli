FROM tronprotocol/tron-gradle

RUN set -o errexit -o nounset \
    echo "git clone" \
    && git clone https://github.com/flyq/wallet-cli.git \
    && cd wallet-cli \
    && gradle build
    
WORKDIR /wallet-cli

EXPOSE 18889