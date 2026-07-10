package org.tron.core.manager;

import static org.tron.common.utils.ByteUtil.hexStringToIntegerList;

import java.util.List;
import org.junit.Assert;
import org.junit.Test;

public class UpdateAccountPermissionInteractiveTest {

  @Test
  public void defaultActiveOperationsExcludeShieldedTransferContract() {
    List<Integer> operations =
        hexStringToIntegerList(UpdateAccountPermissionInteractive.DEFAULT_ACTIVE_OPERATIONS);

    Assert.assertFalse(operations.contains(51));
    Assert.assertTrue(operations.contains(49));
    Assert.assertTrue(operations.contains(52));
  }

  @Test
  public void opLabelDistinguishesUnlistedAndUnknownOperations() {
    Assert.assertEquals("Transfer TRX", UpdateAccountPermissionInteractive.opLabel(1));
    Assert.assertEquals("Unlisted op 51 (ShieldedTransferContract)",
        UpdateAccountPermissionInteractive.opLabel(51));
    Assert.assertEquals("Unknown op 255", UpdateAccountPermissionInteractive.opLabel(255));
  }
}
