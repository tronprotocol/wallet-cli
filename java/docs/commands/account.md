# Account commands

Query and update on-chain accounts, manage account metadata, and view local records.

## How to create account

You can create accounts by transferring funds to non-existing accounts, or by initiating a transaction to create an account using the **CreateAccount** command. Transferring to a non-existent account has a minimum restriction amount of **1 TRX**. Creating an account through the `CreateAccount` command still burns **1 TRX**.

## CreateAccount

Create a new account with an inactive address, burning a 1-TRX handling fee for it.

```console
> CreateAccount [OwnerAddress] Address
```

Example:

```console
wallet> createaccount TDJ13zZzT3w91WMBm98gC3mwL7NbA6sQPA
{
	"raw_data":{
		"contract":[
			{
				"parameter":{
					"value":{
						"owner_address":"TQLaB7L8o3ikjRVcN7tTjMZsRYPJ23XZbd",
						"account_address":"TDJ13zZzT3w91WMBm98gC3mwL7NbA6sQPA"
					},
					"type_url":"type.googleapis.com/protocol.AccountCreateContract"
				},
				"type":"AccountCreateContract"
			}
		],
		"ref_block_bytes":"91a4",
		"ref_block_hash":"2bfcd3bb597f3d40",
		"expiration":1745333676000,
		"timestamp":1745333618318
	},
	"raw_data_hex":"0a0291a422082bfcd3bb597f3d4040e0cff9efe5325a6612640a32747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e4163636f756e74437265617465436f6e7472616374122e0a15419d9c2bb5ee381a4396dd49ce42292e756b2e5e4b12154124764e4674179d4578cfc4c833c1ac1a09f6ce56708e8df6efe532"
}
Before sign transaction hex string is 0a84010a0291a422082bfcd3bb597f3d4040e0cff9efe5325a6612640a32747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e4163636f756e74437265617465436f6e7472616374122e0a15419d9c2bb5ee381a4396dd49ce42292e756b2e5e4b12154124764e4674179d4578cfc4c833c1ac1a09f6ce56708e8df6efe532
Please confirm and input your permission id, if input y/Y means default 0, other non-numeric characters will cancel transaction.
y
Please choose your key for sign.
The 1th keystore file name is TJEEKTmaVTYSpJAxahtyuofnDSpe2seajB.json
The 2th keystore file name is TX1L9xonuUo1AHsjUZ3QzH8wCRmKm56Xew.json
The 3th keystore file name is TVuVqnJFuuDxN36bhEbgDQS7rNGA5dSJB7.json
The 4th keystore file name is Ledger-TRvVXgqddDGYRMx3FWf2tpVxXQQXDZxJQe.json
The 5th keystore file name is TYXFDtn86VPFKg4mkwMs45DKDcpAyqsada.json
Please choose between 1 and 5
1
After sign transaction hex string is 0a84010a0291a422082bfcd3bb597f3d404083bd9cfae5325a6612640a32747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e4163636f756e74437265617465436f6e7472616374122e0a15419d9c2bb5ee381a4396dd49ce42292e756b2e5e4b12154124764e4674179d4578cfc4c833c1ac1a09f6ce56708e8df6efe5321241ce53add4f75fe1838aa7e0a4e2411b3bbfce1d2164d68dac18507ed87e22ae503f65592a1161640834b3c0cef43c28f20b2d335120cc78b6f745a82ea95e451100
TxId is 26d6fcdfdc0018097ec4166eb140e19ebd597bea2212579d2f6d921b0ad6e56f
CreateAccount  successful !!
```

## GenerateAddress

Generate an address and print out the address and private key.

## GetAccount

Get account information based on an address.

```console
> GetAccount Address
```

## GetAccountById

Get account details through an account ID.

```console
> GetAccountById accountId
```

## GetAccountNet

Show the usage of bandwidth.

```console
> GetAccountNet Address
```

## GetAccountResource

Show the usage of bandwidth and energy.

```console
> getAccountResource Address
```

## GetAddress

Get the address of the current login account. Takes no parameters.

## GetBalance

Get the balance of the current login account, or of `Address` when one is given.

```console
> GetBalance [Address]
```

## SetAccountId

Set a custom unique identifier (Account ID) for an account.

```console
> SetAccountId [owner_address] account_id
```

```console
> SetAccountId TEDapYSVvAZ3aYH7w8N9tMEEFKaNKUD5Bp 100
```

## UpdateAccount

Modify the account name.

```console
> UpdateAccount [owner_address] account_name
```

```console
> UpdateAccount test-name
```

## ViewBackupRecords

View backup records. You can configure the maximum number of records that `maxRecords` can retain in [`config.conf`](../reference/config.md), excluding the number of buffer records.

```console
wallet> ViewBackupRecords

=== View Backup Records ===
1. View all records
2. Filter by time range
Choose an option (1-2): 1
```

## ViewTransactionHistory

View transaction history. You can configure the maximum number of records that `maxRecords` can retain in [`config.conf`](../reference/config.md), excluding the number of buffer records.

```console
wallet> ViewTransactionHistory
====================================
        TRANSACTION VIEWER
====================================

MAIN MENU:
1. View all transactions
2. Filter by time range
3. Help
4. Exit
Select option: 1
```

## ShowReceivingQrCode

Display a receive-payment QR code for the current address. This command requires `qrencode` to be installed on the terminal in advance:

- Debian/Ubuntu: `sudo apt install qrencode`
- CentOS: `sudo yum install qrencode`
- RHEL/Fedora: `sudo dnf install qrencode`
- macOS: `brew install qrencode`

```console
wallet> ShowReceivingQrCode
█████████████████████████████████████
████ ▄▄▄▄▄ ██▄▀▀ ▄ ▀▄▀ ▀▀█ ▄▄▄▄▄ ████
████ █   █ █▄  ▀▄  ▀▄▀▀███ █   █ ████
████ █▄▄▄█ ██▀▄██▀▄▀▄▀ ▀██ █▄▄▄█ ████
████▄▄▄▄▄▄▄█ ▀ █ ▀ ▀ ▀ ▀ █▄▄▄▄▄▄▄████
████▄  █▄▄▄▄▄█  ██  ▀▀██▀  ██▀▄▀▀████
████▄█▀▄█▀▄▀▄▄█▀█▄█▀▄ █▀██▄ █▄▄ ▄████
████ █▄█▄ ▄▄▄██▀ ▀█▀▄██▄█▄▄ █ █ ▄████
████ ▄▀▄▀▄▄▀ ▄█▄ ▀ ▀█  █ ██▀▀█▄▄▄████
████▄█▀ ██▄██ ▄ ██ ██ █   ▄▄▄   ▄████
████▄▀▀ ▀█▄█▀▄▀▀█▄█▄█▀ ▀▄▀█ ▄▄▄ ▄████
████▄██▄█▄▄▄▀ ▄▀ ▀██  ▄▄ ▄▄▄  ▄▄▄████
████ ▄▄▄▄▄ █ █▀▄ ▀ █▄▀▄  █▄█ ▄█▄ ████
████ █   █ █▄▀▀ ██ ▄▄  █  ▄ ▄▄▄██████
████ █▄▄▄█ █ ▀█▀█▄█▄▀▀█▄ ▄█  ██▀▄████
████▄▄▄▄▄▄▄█▄▄██▄██ ▀▀▄▄▄▄█   ▀  ████
█████████████████████████████████████
TEDapYSVvAZ3aYH7w8N9tMEEFKaNKUD5Bp
```

## See also

- [wallet](wallet.md) — create / import / session management
- [chain-data](chain-data.md) — transaction and block queries
- [usdt](usdt.md) — token balances and the address book
