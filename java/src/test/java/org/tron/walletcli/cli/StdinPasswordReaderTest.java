package org.tron.walletcli.cli;

import org.junit.Assert;
import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class StdinPasswordReaderTest {

  @Test
  public void readsRawBytesAndStripsTrailingNewline() {
    StdinPasswordReader r = new StdinPasswordReader(stream("Secret123!A\n"));
    Assert.assertEquals("Secret123!A", r.get());
  }

  @Test
  public void stripsTrailingCrlfButPreservesInternalWhitespace() {
    StdinPasswordReader r = new StdinPasswordReader(stream("Secret with spaces\r\n"));
    Assert.assertEquals("Secret with spaces", r.get());
  }

  @Test
  public void preservesPasswordWithoutTrailingNewline() {
    StdinPasswordReader r = new StdinPasswordReader(stream("NoTrailing"));
    Assert.assertEquals("NoTrailing", r.get());
  }

  @Test
  public void preservesInternalNewlinesButOnlyStripsLastOne() {
    StdinPasswordReader r = new StdinPasswordReader(stream("line1\nline2\n"));
    Assert.assertEquals("line1\nline2", r.get());
  }

  @Test
  public void emptyInputReturnsNull() {
    StdinPasswordReader r = new StdinPasswordReader(stream(""));
    Assert.assertNull(r.get());
  }

  @Test
  public void inputThatIsOnlyANewlineReturnsNull() {
    StdinPasswordReader r = new StdinPasswordReader(stream("\n"));
    Assert.assertNull(r.get());
  }

  @Test
  public void readIsMemoizedAcrossMultipleCalls() {
    // ByteArrayInputStream returns -1 on EOF and stays drained, so a second get() returning
    // "OnlyOnce" rather than null proves the value is cached and the stream is not re-read.
    InputStream once = new ByteArrayInputStream("OnlyOnce\n".getBytes(StandardCharsets.UTF_8));
    StdinPasswordReader r = new StdinPasswordReader(once);
    Assert.assertEquals("OnlyOnce", r.get());
    Assert.assertEquals("OnlyOnce", r.get());
    // After the first get() the stream is at EOF — confirm a fresh read would yield null.
    Assert.assertNull(new StdinPasswordReader(once).get());
  }

  @Test
  public void ioExceptionIsWrappedAsIllegalState() {
    InputStream broken = new InputStream() {
      @Override
      public int read() throws IOException {
        throw new IOException("kaboom");
      }
    };
    try {
      new StdinPasswordReader(broken).get();
      Assert.fail("Expected IllegalStateException");
    } catch (IllegalStateException e) {
      Assert.assertTrue(e.getMessage().contains("kaboom"));
    }
  }

  private static InputStream stream(String s) {
    return new ByteArrayInputStream(s.getBytes(StandardCharsets.UTF_8));
  }
}
