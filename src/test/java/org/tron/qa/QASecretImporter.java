package org.tron.qa;

import org.tron.common.crypto.ECKey;
import org.tron.common.utils.ByteArray;
import org.tron.keystore.StringUtils;
import org.tron.keystore.Wallet;
import org.tron.keystore.WalletFile;
import org.tron.mnemonic.MnemonicUtils;
import org.tron.walletcli.cli.ActiveWalletConfig;
import org.tron.walletserver.WalletApi;

import java.util.Arrays;
import java.util.List;

/**
 * QA-only helper for importing wallets from environment variables without
 * exposing secrets through process arguments.
 */
public class QASecretImporter {

  public static void main(String[] args) throws Exception {
    if (args.length != 1) {
      System.err.println("Usage: QASecretImporter <private-key|mnemonic>");
      System.exit(1);
    }

    String envPassword = System.getenv("MASTER_PASSWORD");
    if (envPassword == null || envPassword.isEmpty()) {
      System.err.println("MASTER_PASSWORD is required");
      System.exit(1);
    }

    byte[] password = StringUtils.char2Byte(envPassword.toCharArray());
    try {
      if ("private-key".equals(args[0])) {
        importPrivateKey(password);
      } else if ("mnemonic".equals(args[0])) {
        importMnemonic(password);
      } else {
        System.err.println("Unknown import mode: " + args[0]);
        System.exit(1);
      }
    } finally {
      Arrays.fill(password, (byte) 0);
    }
  }

  private static void importPrivateKey(byte[] password) throws Exception {
    String privateKeyHex = System.getenv("TRON_TEST_PRIVATE_KEY");
    if (privateKeyHex == null || privateKeyHex.isEmpty()) {
      System.err.println("TRON_TEST_PRIVATE_KEY is required for private-key import");
      System.exit(1);
    }

    byte[] privateKey = ByteArray.fromHexString(privateKeyHex);
    try {
      ECKey ecKey = ECKey.fromPrivate(privateKey);
      storeWallet(password, ecKey);
      System.out.println("Import wallet successful, keystore created");
    } finally {
      Arrays.fill(privateKey, (byte) 0);
    }
  }

  private static void importMnemonic(byte[] password) throws Exception {
    String mnemonic = System.getenv("TRON_TEST_MNEMONIC");
    if (mnemonic == null || mnemonic.trim().isEmpty()) {
      System.err.println("TRON_TEST_MNEMONIC is required for mnemonic import");
      System.exit(1);
    }

    List<String> words = Arrays.asList(mnemonic.trim().split("\\s+"));
    byte[] privateKey = MnemonicUtils.getPrivateKeyFromMnemonic(words);
    try {
      WalletApi.WalletCreationResult result = WalletApi.CreateWalletFileForCli(password, privateKey, words);
      WalletFile walletFile = result.getWalletFile();
      walletFile.setName("mywallet");
      WalletApi.store2Keystore(walletFile);
      ActiveWalletConfig.setActiveAddress(walletFile.getAddress());
      System.out.println("Import wallet by mnemonic successful, keystore created");
    } finally {
      Arrays.fill(privateKey, (byte) 0);
    }
  }

  private static void storeWallet(byte[] password, ECKey ecKey) throws Exception {
    WalletFile walletFile = Wallet.createStandard(password, ecKey);
    walletFile.setName("mywallet");
    WalletApi.store2Keystore(walletFile);
    ActiveWalletConfig.setActiveAddress(walletFile.getAddress());
  }
}
