# GasFree transfers

Wallet-cli supports GasFree integration — gas-free TRC20 transfers via the GasFree service.

For more details, see the [GasFree Documentation](https://gasfree.io/specification) and the [TronLink User Guide for GasFree](https://support.tronlink.org/hc/en-us/articles/38903684778393-GasFree-User-Guide).

**Prerequisites.** You must obtain an **API Key** and **API Secret** from GasFree for authentication, and set them in [`config.conf`](../reference/config.md). See the official [application form](https://docs.google.com/forms/d/e/1FAIpQLSc5EB1X8JN7LA4SAVAG99VziXEY6Kv6JxmlBry9rUBlwI-GaQ/viewform) for how to set up API authentication.

## GasFreeInfo

Query GasFree information — retrieve basic info, including the GasFree address associated with your current wallet address. The GasFree address is automatically activated upon the first transfer, which may incur an activation fee.

For the current wallet address:

```console
wallet> gasfreeinfo
{
	"gasFreeAddress":"TCtSt8fCkZcVdrGpaVHUr6P8EmdjysswMF",
	"active":true,
	"tokenBalance":998696000,
	"activateFee":0,
	"transferFee":2000,
	"maxTransferValue":998694000
}
gasFreeInfo:  successful !!
```

For a specified address:

```console
wallet> gasfreeinfo TRvVXgqddDGYRMx3FWf2tpVxXQQXDZxJQe
{
	"gasFreeAddress":"TCtSt8fCkZcVdrGpaVHUr6P8EmdjysswMF",
	"active":true,
	"tokenBalance":998696000,
	"activateFee":0,
	"transferFee":2000,
	"maxTransferValue":998694000
}
gasFreeInfo:  successful !!
```

## GasFreeTransfer

Submit a gas-free token transfer request.

```console
wallet> gasfreetransfer TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT 100000

GasFreeTransfer result: 
{
	"code":200,
	"data":{
		"amount":100000,
		"providerAddress":"TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E",
		"apiKey":"",
		"accountAddress":"TUUSMd58eC3fKx3fn7whxJyr1FR56tgaP8",
		"signature":"",
		"targetAddress":"TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT",
		"maxFee":2000000,
		"version":1,
		"nonce":8,
		"tokenAddress":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
		"createdAt":1747909635678,
		"expiredAt":1747909695000,
		"estimatedTransferFee":2000,
		"id":"6c3ff67e-0bf4-4c09-91ca-0c7c254b01a0",
		"state":"WAITING",
		"estimatedActivateFee":0,
		"gasFreeAddress":"TNER12mMVWruqopsW9FQtKxCGfZcEtb3ER",
		"updatedAt":1747909635678
	}
}
GasFreeTransfer  successful !!!
```

## GasFreeTrace

Track transfer status — check the progress of a GasFree transfer using the `id` (trace ID) obtained from `GasFreeTransfer`.

```console
wallet> gasfreetrace 6c3ff67e-0bf4-4c09-91ca-0c7c254b01a0
GasFreeTrace result: 
{
	"code":200,
	"data":{
		"amount":100000,
		"providerAddress":"TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E",
		"txnTotalCost":102000,
		"accountAddress":"TUUSMd58eC3fKx3fn7whxJyr1FR56tgaP8",
		"txnActivateFee":0,
		"estimatedTotalCost":102000,
		"targetAddress":"TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT",
		"txnBlockTimestamp":1747909638000,
		"txnTotalFee":2000,
		"nonce":8,
		"estimatedTotalFee":2000,
		"tokenAddress":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
		"txnHash":"858f9a00776163b1f8a34467b9c5727657f8971a9f4e9d492f0a247fac0384f9",
		"txnBlockNum":57175988,
		"createdAt":1747909635678,
		"expiredAt":1747909695000,
		"estimatedTransferFee":2000,
		"txnState":"ON_CHAIN",
		"id":"6c3ff67e-0bf4-4c09-91ca-0c7c254b01a0",
		"state":"CONFIRMING",
		"estimatedActivateFee":0,
		"gasFreeAddress":"TNER12mMVWruqopsW9FQtKxCGfZcEtb3ER",
		"txnTransferFee":2000,
		"txnAmount":100000
	}
}
GasFreeTrace:  successful!!
```

## See also

- [reference/config](../reference/config.md) — GasFree API key / secret setup
- [usdt](usdt.md) — regular (non-gas-free) TRC20 transfers
