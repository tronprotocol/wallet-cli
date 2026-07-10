package org.tron.walletcli.cli.ledger;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import org.junit.Assert;
import org.junit.Test;

public class SystemOutSuppressorTest {

  @Test
  public void capturesPrintsAndRestoresStreamOnClose() {
    PrintStream original = System.out;
    ByteArrayOutputStream sentinel = new ByteArrayOutputStream();
    System.setOut(new PrintStream(sentinel));
    try {
      try (SystemOutSuppressor s = SystemOutSuppressor.capture()) {
        System.out.println("noisy");
        System.out.print("more");
        Assert.assertTrue(s.drained().contains("noisy"));
        Assert.assertTrue(s.drained().contains("more"));
      }
      System.out.println("after-close");
      Assert.assertTrue("post-close output reaches the surrounding stream",
              sentinel.toString().contains("after-close"));
      Assert.assertFalse("captured output did not leak to the surrounding stream",
              sentinel.toString().contains("noisy"));
    } finally {
      System.setOut(original);
    }
  }

  @Test
  public void drainedReturnsEmptyWhenNothingPrinted() {
    PrintStream original = System.out;
    try {
      try (SystemOutSuppressor s = SystemOutSuppressor.capture()) {
        Assert.assertEquals("", s.drained());
      }
    } finally {
      System.setOut(original);
    }
  }
}
