package org.tron.common.utils;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import org.junit.Assert;
import org.junit.Test;
import org.tron.protos.Protocol.Transaction;

public class TransactionUtilsTest {

  @Test
  public void setPermissionIdWithNullTipDoesNotPrompt() throws Exception {
    PrintStream originalOut = System.out;
    java.io.InputStream originalIn = System.in;
    ByteArrayOutputStream stdout = new ByteArrayOutputStream();
    System.setOut(new PrintStream(stdout));
    System.setIn(new ByteArrayInputStream("unexpected\n".getBytes(StandardCharsets.UTF_8)));
    try {
      Transaction transaction = Transaction.newBuilder()
          .setRawData(Transaction.raw.newBuilder()
              .addContract(Transaction.Contract.newBuilder().build())
              .build())
          .build();

      Transaction result = TransactionUtils.setPermissionId(transaction, null);

      Assert.assertEquals(0, result.getRawData().getContract(0).getPermissionId());
      Assert.assertEquals("", stdout.toString(StandardCharsets.UTF_8.name()));
    } finally {
      System.setOut(originalOut);
      System.setIn(originalIn);
      TransactionUtils.clearPermissionIdOverride();
    }
  }
}
