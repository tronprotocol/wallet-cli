interface Token {
  address: string;
  decimals: number;
  name: string;
  version: string;
  permit2?: boolean;
}
export const X402_TOKENS: Record<string, Record<string, Token>> = {
  "tron:728126428": {
    USDT: {
      address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      decimals: 6,
      name: "Tether USD",
      version: "1",
      permit2: true,
    },
    USDD: {
      address: "TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz",
      decimals: 18,
      name: "Decentralized USD",
      version: "1",
      permit2: true,
    },
  },
  "tron:3448148188": {
    USDT: {
      address: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
      decimals: 6,
      name: "Tether USD",
      version: "1",
      permit2: true,
    },
    USDD: {
      address: "TGjgvdTWWrybVLaVeFqSyVqJQWjxqRYbaK",
      decimals: 18,
      name: "Decentralized USD",
      version: "1",
      permit2: true,
    },
  },
  "tron:2494104990": {
    USDT: {
      address: "TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs",
      decimals: 6,
      name: "Tether USD",
      version: "1",
    },
  },
  "eip155:56": {
    USDT: {
      address: "0x55d398326f99059fF775485246999027B3197955",
      decimals: 18,
      name: "Tether USD",
      version: "1",
      permit2: true,
    },
  },
  "eip155:84532": { USDC: { address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6, name: "USDC", version: "2" } },
  "eip155:8453": {
    USDC: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
      name: "USD Coin",
      version: "2",
    },
  },
  "eip155:97": {
    USDT: {
      address: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
      decimals: 18,
      name: "Tether USD",
      version: "1",
      permit2: true,
    },
    USDC: {
      address: "0x64544969ed7EBf5f083679233325356EbE738930",
      decimals: 18,
      name: "USD Coin",
      version: "1",
      permit2: true,
    },
  },
};
