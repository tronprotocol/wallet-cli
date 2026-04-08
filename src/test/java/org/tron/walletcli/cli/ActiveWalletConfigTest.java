package org.tron.walletcli.cli;

import org.junit.Assert;
import org.junit.Test;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;

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
}
