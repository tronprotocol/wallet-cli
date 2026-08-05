# Wallet management

Create, import, export, and manage local wallets, plus session state (login / lock / switch).

For the concepts behind keystores and secrets, see the [Setup / Configuration reference](../reference/config.md). For a full first-run walkthrough, see the [getting-started guide](../guide/getting-started.md).

## RegisterWallet

Register your wallet. You need to set the wallet password; this generates the address and private key.

## ImportWallet

Import a wallet from a hex-string private key. You need to set a password.

## ImportWalletByBase64

Import a wallet from a base64 private key. You need to set a password.

## ImportWalletByMnemonic

Import a wallet from a mnemonic. You need to set a password and enter the mnemonic.

```console
wallet> ImportWalletByMnemonic
Please input password.
password:
Please input password again.
password:
Please enter 12 words (separated by spaces) [Attempt 1/3]:
```

## ExportWalletMnemonic

Export the mnemonic of the address in the wallet.

```console
wallet> ExportWalletMnemonic
Please input your password.
password:
exportWalletMnemonic successful !!
a*ert tw*st co*rect mat*er pa*s g*ther p*t p*sition s*op em*ty coc*nut aband*n
```

## ExportWalletKeystore

Export the wallet keystore in the TronLink wallet format.

```console
wallet> ExportWalletKeystore tronlink /tmp
Please input your password.
password:
exported keystore file : /tmp/TYdhEg8b7tXm92UDbRDXPtJNU6T9xVGbbo.json
exportWalletKeystore successful !!
```

## ImportWalletByKeystore

Import a TronLink-format keystore file into wallet-cli.

```console
wallet> ImportWalletByKeystore tronlink /tmp/tronlink.json
Please input password.
password:
Please input password again.
password:
fileName = TYQq6zp51unQDNELmT4xKMWh5WLcwpCDZJ.json
importWalletByKeystore successful !!
```

## ImportWalletByLedger

Import a derived account from a Ledger device into wallet-cli.

```console
wallet> ImportWalletByLedger
((Note:This will pair Ledger to user your hardward wallet)
Only one Ledger device is supported. If you have multiple devices, please ensure only one is connected.
Ledger device found: Nano X
Please input password.
password:
Please input password again.
password:
-------------------------------------------------
Default Account Address: TAT1dA8F9HXGqmhvMCjxCKAD29YxDRw81y
Default Path: m/44'/195'/0'/0/0
-------------------------------------------------
1. Import Default Account
2. Change Path
3. Custom Path
Select an option: 1
Import a wallet by Ledger successful, keystore file : ./Wallet/Ledger-TAT1dA8F9HXGqmhvMCjxCKAD29YxDRw81y.json
You are now logged in, and you can perform operations using this account.
```

## BackupWallet

Back up your wallet. You need to enter your wallet password; it exports the private key in hex-string format, such as: `1234567890123456789012345678901234567890123456789012345678901234`

## BackupWallet2Base64

Back up your wallet. You need to enter your wallet password; it exports the private key in base64 format, such as: `ch1jsHTxjUHBR+BMlS7JNGd3ejC28WdFvEeo6uUHZUU=`

## ChangePassword

Modify the password of an account.

## GenerateSubAccount

Generate a sub-account using the mnemonic in the wallet.

```console
wallet> GenerateSubAccount  
Please input your password.  
password:  

=== Sub Account Generator ===  
-----------------------------  
Default Address: TYEhEg7b7tXm92UDbRDXPtJNU6T9xVGbbo  
Default Path: m/44'/195'/0'/0/1  
-----------------------------  

1. Generate Default Path  
2. Change Account  
3. Custom Path  

Enter your choice (1-3): 1  
mnemonic file : ./Mnemonic/TYEhEg7b7tXm92UDbRDXPtJNU6T9xVGbbo.json  
Generate a sub account successful, keystore file name is TYEhEg7b7tXm92UDbRDXPtJNU6T9xVGbbo.json  
generateSubAccount successful.  
```

## ClearWalletKeystore

Clear the wallet keystore of the login account.

```console
wallet> ClearWalletKeystore 

Warning: Dangerous operation!
This operation will permanently delete the Wallet&Mnemonic files of the Address: TABWx7yFhWrvZHbwKcCmFLyPLWjd2dZ2Rq
Warning: The private key and mnemonic words will be permanently lost and cannot be recovered!
Continue? (y/Y to proceed):y

Final confirmation:
Please enter: 'DELETE' to confirm the delete operation:
Confirm: (DELETE): DELETE

File deleted successfully:
- /wallet-cli/Wallet/TABWx8yFhWrvZHbwKcCmFLyPLWjd2dZ2Rq.json
- /wallet-cli/Mnemonic/TABWx8yFhWrvZHbwKcCmFLyPLWjd2dZ2Rq.json
ClearWalletKeystore successful !!!
```

## ResetWallet

Delete all local wallet keystore files and mnemonic files, and follow the prompts to re-register or import a wallet.

```console
wallet> resetwallet
User defined config file doesn't exists, use default config file in jar

Warning: Dangerous operation!
This operation will permanently delete the Wallet&Mnemonic files 
Warning: The private key and mnemonic words will be permanently lost and cannot be recovered!
Continue? (y/Y to proceed, c/C to cancel): 
y

Final confirmation:
Please enter: 'DELETE' to confirm the delete operation:
Confirm: (DELETE): DELETE
resetWallet  successful !!!
Now, you can RegisterWallet or ImportWallet again. Or import the wallet through other means.
```

## LoginAll

Log in to multiple keystore accounts with a unified password.

```console
wallet> loginall
Please input your password.
password: 
Use user defined config file in current dir
[========================================] 100%
The 1th keystore file name is TJEEKTmaVTYSpJAxahtyuofnDSpe2seajB.json
The 2th keystore file name is TX1L9xonuUo1AHsjUZ3QzH8wCRmKm56Xew.json
The 3th keystore file name is TVuVqnJFuuDxN36bhEbgDQS7rNGA5dSJB7.json
The 4th keystore file name is Ledger-TRvVXgqddDGYRMx3FWf2tpVxXQQXDZxJQe.json
The 5th keystore file name is TYXFDtn86VPFKg4mkwMs45DKDcpAyqsada.json
Please choose between 1 and 5
5
LoginAll  successful !!!
```

## Logout

Log out of the current wallet account.

```console
wallet> Logout
Logout  successful !!!
```

## Lock

Lock the login account so that signatures and transactions are not allowed. Requires `lockAccount = true` in [`config.conf`](../reference/config.md).

```console
wallet> lock
lock  successful !!!
```

## Unlock

Unlock a locked login account. By default it re-locks after 300 seconds; you can pass the unlock duration in seconds. Requires `lockAccount = true` in [`config.conf`](../reference/config.md).

```console
wallet> unlock 60
Please input your password.
password: 
unlock  successful !!!
```

## SwitchWallet

After logging in with `LoginAll`, switch between wallets.

```console
wallet> switchwallet
The 1th keystore file name is TJEEKTmaVTYSpJAxahtyuofnDSpe2seajB.json
The 2th keystore file name is TX1L9xonuUo1AHsjUZ3QzH8wCRmKm56Xew.json
The 3th keystore file name is TVuVqnJFuuDxN36bhEbgDQS7rNGA5dSJB7.json
The 4th keystore file name is Ledger-TRvVXgqddDGYRMx3FWf2tpVxXQQXDZxJQe.json
The 5th keystore file name is TYXFDtn86VPFKg4mkwMs45DKDcpAyqsada.json
Please choose between 1 and 5
5
SwitchWallet  successful !!!
```

## ModifyWalletName

Modify the wallet's name.

```console
wallet> ModifyWalletName new-name
Modify Wallet Name  successful !!
```

## See also

- [account](account.md) — account queries and metadata
- [network](network.md) — switch between networks
- [multisig](multisig.md) · [concepts/multisig](../concepts/multisig.md)
