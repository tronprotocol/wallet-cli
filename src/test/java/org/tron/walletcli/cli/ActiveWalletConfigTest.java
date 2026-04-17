package org.tron.walletcli.cli;

import org.bouncycastle.util.encoders.Hex;
import org.junit.Assert;
import org.junit.Test;
import org.tron.keystore.WalletFile;
import org.tron.keystore.WalletUtils;
import org.tron.walletserver.WalletApi;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;

public class ActiveWalletConfigTest {

  @Test
  public void readActiveAddressFromFileReturnsAddressWhenConfigIsValid() throws Exception {
    File configFile = writeConfig("{\"address\":\"TXYZ\"}");

    Assert.assertEquals("TXYZ", ActiveWalletConfig.readActiveAddressFromFile(configFile));
  }

  @Test
  public void readActiveAddressFromFileRejectsInvalidAddressType() throws Exception {
    File configFile = writeConfig("{\"address\":123}");

    try {
      ActiveWalletConfig.readActiveAddressFromFile(configFile);
      Assert.fail("Expected invalid address value to fail");
    } catch (IOException e) {
      Assert.assertEquals("Active wallet config contains an invalid address value", e.getMessage());
    }
  }

  @Test
  public void readActiveAddressFromFileRejectsMissingAddressField() throws Exception {
    File configFile = writeConfig("{\"name\":\"wallet\"}");

    try {
      ActiveWalletConfig.readActiveAddressFromFile(configFile);
      Assert.fail("Expected missing address field to fail");
    } catch (IOException e) {
      Assert.assertEquals("Active wallet config is missing the address field", e.getMessage());
    }
  }

  @Test
  public void getActiveAddressLenientTreatsMalformedConfigAsUnset() throws Exception {
    String originalUserDir = System.getProperty("user.dir");
    File tempDir = Files.createTempDirectory("active-wallet-lenient").toFile();
    File walletDir = new File(tempDir, "Wallet");
    File configFile = new File(walletDir, ".active-wallet");

    Assert.assertTrue(walletDir.mkdirs());
    Files.write(configFile.toPath(), "{\"address\":123}".getBytes(StandardCharsets.UTF_8));
    System.setProperty("user.dir", tempDir.getAbsolutePath());
    try {
      Assert.assertNull(ActiveWalletConfig.getActiveAddressLenient());
    } finally {
      System.setProperty("user.dir", originalUserDir);
    }
  }

  @Test
  public void clearConfigFileReturnsFalseWhenDeleteFails() throws Exception {
    File tempDir = Files.createTempDirectory("active-wallet-clear-test").toFile();
    File configDir = new File(tempDir, ".active-wallet");
    File nestedFile = new File(configDir, "stale");

    Assert.assertTrue(configDir.mkdirs());
    Assert.assertTrue(nestedFile.createNewFile());

    try {
      boolean result = ActiveWalletConfig.clearConfigFile(configDir);
      Assert.assertFalse("expected clearConfigFile to return false when delete fails", result);
    } finally {
      nestedFile.delete();
      configDir.delete();
      tempDir.delete();
    }
  }

  @Test
  public void resolveWalletOverrideStrictAcceptsAbsolutePathWhenFileExists() throws Exception {
    File tempDir = Files.createTempDirectory("active-wallet-explicit").toFile();
    File walletFile = createWalletFile(tempDir, "alpha",
        "0000000000000000000000000000000000000000000000000000000000000001");
    File missingWalletDir = new File(tempDir, "MissingWallet");

    File resolved = ActiveWalletConfig.resolveWalletOverrideStrict(missingWalletDir, walletFile.getAbsolutePath());
    Assert.assertEquals(walletFile.getCanonicalPath(), resolved.getCanonicalPath());
  }

  @Test
  public void resolveWalletOverrideStrictFailsWithPathErrorForMissingExplicitPath() throws Exception {
    File tempDir = Files.createTempDirectory("active-wallet-missing-path").toFile();
    File missingWalletDir = new File(tempDir, "MissingWallet");
    String missingPath = new File(tempDir, "nonexistent/wallet.json").getAbsolutePath();

    try {
      ActiveWalletConfig.resolveWalletOverrideStrict(missingWalletDir, missingPath);
      Assert.fail("Expected IOException for missing explicit path");
    } catch (IOException e) {
      Assert.assertTrue(e.getMessage().contains("Wallet file not found"));
      Assert.assertFalse(e.getMessage().contains("Wallet directory not found"));
    }
  }

  @Test
  public void resolveWalletOverrideStrictRejectsAmbiguousWalletName() throws Exception {
    File walletDir = Files.createTempDirectory("active-wallet-ambiguous").toFile();
    createWalletFile(walletDir, "duplicate",
        "0000000000000000000000000000000000000000000000000000000000000001");
    createWalletFile(walletDir, "duplicate",
        "0000000000000000000000000000000000000000000000000000000000000002");

    try {
      ActiveWalletConfig.resolveWalletOverrideStrict(walletDir, "duplicate");
      Assert.fail("Expected ambiguous wallet name to fail");
    } catch (IllegalArgumentException e) {
      Assert.assertTrue(e.getMessage().contains("Multiple wallets found with name 'duplicate'"));
    }
  }

  @Test
  public void resolveActiveWalletFileStrictRejectsMalformedConfig() throws Exception {
    String originalUserDir = System.getProperty("user.dir");
    File tempDir = Files.createTempDirectory("active-wallet-malformed").toFile();
    File walletDir = new File(tempDir, "Wallet");
    File configFile = new File(walletDir, ".active-wallet");

    Assert.assertTrue(walletDir.mkdirs());
    Files.write(configFile.toPath(), "{\"address\":123}".getBytes(StandardCharsets.UTF_8));
    System.setProperty("user.dir", tempDir.getAbsolutePath());
    try {
      ActiveWalletConfig.resolveActiveWalletFileStrict(walletDir);
      Assert.fail("Expected malformed active wallet config to fail");
    } catch (IOException e) {
      Assert.assertEquals("Active wallet config contains an invalid address value", e.getMessage());
    } finally {
      System.setProperty("user.dir", originalUserDir);
    }
  }

  @Test
  public void resolveActiveWalletFileStrictRejectsMissingKeystore() throws Exception {
    String originalUserDir = System.getProperty("user.dir");
    File tempDir = Files.createTempDirectory("active-wallet-missing-keystore").toFile();
    File walletDir = new File(tempDir, "Wallet");

    Assert.assertTrue(walletDir.mkdirs());
    System.setProperty("user.dir", tempDir.getAbsolutePath());
    try {
      ActiveWalletConfig.setActiveAddress("TMissingWalletAddress");
      try {
        ActiveWalletConfig.resolveActiveWalletFileStrict(walletDir);
        Assert.fail("Expected missing keystore to fail");
      } catch (IOException e) {
        Assert.assertTrue(e.getMessage().contains("Active wallet keystore not found"));
      }
    } finally {
      System.setProperty("user.dir", originalUserDir);
    }
  }

  @Test
  public void findWalletFileByAddressSkipsCorruptFile() throws Exception {
    File walletDir = Files.createTempDirectory("active-wallet-corrupt-addr").toFile();
    File validFile = createWalletFile(walletDir, "good",
        "0000000000000000000000000000000000000000000000000000000000000001");
    String validAddress = WalletUtils.loadWalletFile(validFile).getAddress();

    File corruptFile = new File(walletDir, "corrupt.json");
    Files.write(corruptFile.toPath(), "not valid json".getBytes(StandardCharsets.UTF_8));

    File result = ActiveWalletConfig.findWalletFileByAddress(walletDir, validAddress);
    Assert.assertNotNull(result);
    Assert.assertEquals(validFile.getName(), result.getName());
  }

  @Test
  public void findWalletFileByNameSkipsCorruptFile() throws Exception {
    File walletDir = Files.createTempDirectory("active-wallet-corrupt-name").toFile();
    createWalletFile(walletDir, "good",
        "0000000000000000000000000000000000000000000000000000000000000001");

    File corruptFile = new File(walletDir, "corrupt.json");
    Files.write(corruptFile.toPath(), "not valid json".getBytes(StandardCharsets.UTF_8));

    File result = ActiveWalletConfig.findWalletFileByName(walletDir, "good");
    Assert.assertNotNull(result);
  }

  @Test
  public void findWalletFileByAddressReturnsNullWhenAllCorrupt() throws Exception {
    File walletDir = Files.createTempDirectory("active-wallet-all-corrupt").toFile();
    File corruptFile = new File(walletDir, "corrupt.json");
    Files.write(corruptFile.toPath(), "not valid json".getBytes(StandardCharsets.UTF_8));

    File result = ActiveWalletConfig.findWalletFileByAddress(walletDir, "TSomeAddress");
    Assert.assertNull(result);
  }

  private File writeConfig(String json) throws Exception {
    File dir = Files.createTempDirectory("active-wallet-config-test").toFile();
    File configFile = new File(dir, ".active-wallet");
    try (FileWriter writer = new FileWriter(configFile)) {
      writer.write(json);
    }
    configFile.deleteOnExit();
    dir.deleteOnExit();
    return configFile;
  }

  private File createWalletFile(File walletDir, String walletName, String privateKeyHex) throws Exception {
    byte[] password = "TempPass123!A".getBytes(StandardCharsets.UTF_8);
    byte[] privateKey = Hex.decode(privateKeyHex);
    try {
      WalletFile walletFile = WalletApi.CreateWalletFile(password, privateKey, null);
      walletFile.setName(walletName);
      WalletUtils.generateWalletFile(walletFile, walletDir);
      return walletFile.getSourceFile();
    } finally {
      Arrays.fill(password, (byte) 0);
      Arrays.fill(privateKey, (byte) 0);
    }
  }
}
