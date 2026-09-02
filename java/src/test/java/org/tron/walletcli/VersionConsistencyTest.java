package org.tron.walletcli;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import org.junit.Test;
import org.tron.common.utils.Utils;

public class VersionConsistencyTest {

  @Test
  public void buildVersionMatchesCliVersionAndIsNotSnapshot() {
    String buildVersion = System.getProperty("walletCli.projectVersion");

    assertFalse(buildVersion.endsWith("-SNAPSHOT"));
    assertEquals("v" + buildVersion, Utils.VERSION.trim());
  }
}
