package org.tron.keystore;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import org.junit.Assert;
import org.junit.Test;

public class ClearWalletUtilsTest {

  @Test
  public void deleteFilesQuietDeletesWithoutTerminalNoise() throws Exception {
    PrintStream originalOut = System.out;
    PrintStream originalErr = System.err;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    ByteArrayOutputStream stderr = new ByteArrayOutputStream();
    System.setOut(new PrintStream(stdout));
    System.setErr(new PrintStream(stderr));
    Path dir = Files.createTempDirectory("clear-wallet-utils");
    Path walletFile = dir.resolve("wallet.json");
    Files.write(walletFile, Collections.singletonList("{}"), StandardCharsets.UTF_8);
    try {
      Assert.assertTrue(ClearWalletUtils.deleteFilesQuiet(
          Collections.singletonList(walletFile.toString())));
      Assert.assertFalse(Files.exists(walletFile));
      Assert.assertEquals("", stdout.toString(StandardCharsets.UTF_8.name()));
      Assert.assertEquals("", stderr.toString(StandardCharsets.UTF_8.name()));
    } finally {
      Files.deleteIfExists(dir.resolve("wallet.json.bak"));
      Files.deleteIfExists(walletFile);
      Files.deleteIfExists(dir);
      System.setOut(originalOut);
      System.setErr(originalErr);
    }
  }
}
