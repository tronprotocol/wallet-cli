package org.tron.walletcli;

import org.junit.Assert;
import org.junit.Test;

public class WalletApiWrapperTest {

  @Test
  public void computeBufferedFeeLimitAddsTwentyPercentBuffer() {
    Assert.assertEquals(120L, WalletApiWrapper.computeBufferedFeeLimit(10L, 10L));
  }

  @Test(expected = ArithmeticException.class)
  public void computeBufferedFeeLimitFailsOnOverflow() {
    WalletApiWrapper.computeBufferedFeeLimit(Long.MAX_VALUE, 2L);
  }
}
