package org.tron.walletserver;

import org.junit.Assert;
import org.junit.Test;
import org.tron.common.enums.NetType;
import org.tron.keystore.WalletFile;

public class WalletApiTest {

  @Test
  public void getWalletFileFailsExplicitlyAfterLogout() {
    WalletFile walletFile = new WalletFile();
    walletFile.setAddress("TQsVqVAnvbFdLcbk29N4npwjW6VG84KS2A");
    WalletApi walletApi = new WalletApi(walletFile);

    walletApi.logout();

    try {
      walletApi.getWalletFile();
      Assert.fail("Expected explicit wallet-not-loaded failure");
    } catch (IllegalStateException e) {
      Assert.assertEquals("Wallet not loaded.", e.getMessage());
    }
  }

  // --- sanitizePermissionJson tests ---

  @Test
  public void sanitize_legitimatePermissionJson_passesThrough() {
    String input = "{\"owner_permission\":{\"type\":0,\"permission_name\":\"owner\","
        + "\"threshold\":1,\"keys\":[{\"address\":\"TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL\","
        + "\"weight\":1}]},\"active_permissions\":[{\"type\":2,\"permission_name\":\"active\","
        + "\"threshold\":1,\"operations\":\"7fff1fc0033e\","
        + "\"keys\":[{\"address\":\"TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL\",\"weight\":1}]}]}";
    String result = WalletApi.sanitizePermissionJson(input);
    Assert.assertTrue(result.contains("owner_permission"));
    Assert.assertTrue(result.contains("active_permissions"));
    Assert.assertTrue(result.contains("TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL"));
  }

  @Test
  public void sanitize_stripsTopLevelAtType() {
    String input = "{\"@type\":\"com.sun.rowset.JdbcRowSetImpl\","
        + "\"owner_permission\":{\"type\":0}}";
    String result = WalletApi.sanitizePermissionJson(input);
    Assert.assertFalse(result.contains("@type"));
    Assert.assertTrue(result.contains("owner_permission"));
  }

  @Test
  public void sanitize_stripsNestedAtType() {
    String input = "{\"owner_permission\":{\"@type\":\"evil.Class\",\"type\":0,"
        + "\"keys\":[{\"@type\":\"evil.Key\",\"address\":\"T123\",\"weight\":1}]}}";
    String result = WalletApi.sanitizePermissionJson(input);
    Assert.assertFalse(result.contains("@type"));
    Assert.assertTrue(result.contains("owner_permission"));
    Assert.assertTrue(result.contains("T123"));
  }

  @Test
  public void sanitize_preservesUnknownFieldsForForwardCompatibility() {
    String input = "{\"owner_permission\":{\"type\":0,\"future_field\":\"value\"}}";
    String result = WalletApi.sanitizePermissionJson(input);
    Assert.assertTrue(result.contains("future_field"));
  }

  @Test(expected = IllegalArgumentException.class)
  public void sanitize_rejectsInvalidJson() {
    WalletApi.sanitizePermissionJson("not json at all");
  }

  @Test(expected = IllegalArgumentException.class)
  public void sanitize_rejectsJsonArray() {
    WalletApi.sanitizePermissionJson("[1,2,3]");
  }

  @Test
  public void sanitize_handlesEmptyObject() {
    String result = WalletApi.sanitizePermissionJson("{}");
    Assert.assertEquals("{}", result);
  }

  @Test
  public void sanitize_stripsAtTypeInActivePermissionsArray() {
    String input = "{\"active_permissions\":[{\"@type\":\"evil\",\"type\":2},"
        + "{\"type\":2,\"keys\":[{\"@type\":\"evil2\",\"address\":\"T1\",\"weight\":1}]}]}";
    String result = WalletApi.sanitizePermissionJson(input);
    Assert.assertFalse(result.contains("@type"));
    Assert.assertTrue(result.contains("active_permissions"));
  }

  // --- identifyNetwork tests ---

  /**
   * soliditynode.ip.list is documented as optional, and ApiClient already honours its absence by
   * switching to local-create. Identification used to compare the value the fallback had just
   * copied from fullnode, so omitting it turned a known network into CUSTOM -- which makes the
   * GasFree commands refuse ("MAIN or NILE only") and adds an endpoint filter to the history.
   */
  @Test
  public void identify_fullnodeOnly_stillNamesTheKnownNetwork() {
    Assert.assertEquals(NetType.NILE,
        WalletApi.identifyNetwork(NetType.NILE.getGrpc().getFullNode(), null));
    Assert.assertEquals(NetType.MAIN,
        WalletApi.identifyNetwork(NetType.MAIN.getGrpc().getFullNode(), null));
    Assert.assertEquals(NetType.SHASTA,
        WalletApi.identifyNetwork(NetType.SHASTA.getGrpc().getFullNode(), null));
  }

  @Test
  public void identify_solidityOnly_stillNamesTheKnownNetwork() {
    Assert.assertEquals(NetType.NILE,
        WalletApi.identifyNetwork(null, NetType.NILE.getGrpc().getSolidityNode()));
    Assert.assertEquals(NetType.MAIN,
        WalletApi.identifyNetwork(null, NetType.MAIN.getGrpc().getSolidityNode()));
  }

  @Test
  public void identify_bothSupplied_matchesOnlyWhenBothAgree() {
    Assert.assertEquals(NetType.NILE, WalletApi.identifyNetwork(
        NetType.NILE.getGrpc().getFullNode(), NetType.NILE.getGrpc().getSolidityNode()));
    Assert.assertEquals(NetType.MAIN, WalletApi.identifyNetwork(
        NetType.MAIN.getGrpc().getFullNode(), NetType.MAIN.getGrpc().getSolidityNode()));
  }

  /** Endpoints from two different networks are not a network -- naming one of them would be a lie. */
  @Test
  public void identify_mismatchedPair_isCustom() {
    Assert.assertEquals(NetType.CUSTOM, WalletApi.identifyNetwork(
        NetType.NILE.getGrpc().getFullNode(), NetType.MAIN.getGrpc().getSolidityNode()));
  }

  @Test
  public void identify_unknownEndpoint_isCustom() {
    Assert.assertEquals(NetType.CUSTOM,
        WalletApi.identifyNetwork("grpc.example.com:50051", null));
    Assert.assertEquals(NetType.CUSTOM,
        WalletApi.identifyNetwork(null, "grpc.example.com:50052"));
    Assert.assertEquals(NetType.CUSTOM,
        WalletApi.identifyNetwork("grpc.example.com:50051", "grpc.example.com:50052"));
  }

  /** With nothing declared every candidate would vacuously "agree", so guard the empty case. */
  @Test
  public void identify_nothingDeclared_isCustom() {
    Assert.assertEquals(NetType.CUSTOM, WalletApi.identifyNetwork(null, null));
  }
}
