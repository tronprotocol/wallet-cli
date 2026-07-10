package org.tron.walletserver;

import org.junit.Assert;
import org.junit.Test;
import org.tron.common.enums.NetType;
import org.tron.keystore.WalletFile;
import org.tron.trident.proto.Response;

public class WalletApiTest {

  private static final byte[] OWNER =
      WalletApi.decodeFromBase58Check("TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL");
  private static final byte[] TO =
      WalletApi.decodeFromBase58Check("TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf");

  private static class StubApiClient extends ApiClient {
    private Response.Account queryAccountResult;

    StubApiClient() {
      super(NetType.NILE);
    }

    @Override
    public Response.Account queryAccount(byte[] address) {
      return queryAccountResult;
    }
  }

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

  @Test
  public void sendCoinForCliReturnsNullWhenAccountQueryFails() throws Exception {
    ApiClient originalApiCli = WalletApi.getApiCli();
    StubApiClient stub = new StubApiClient();
    stub.queryAccountResult = null;
    WalletApi.setApiCli(stub);

    try {
      WalletFile walletFile = new WalletFile();
      walletFile.setAddress("TQsVqVAnvbFdLcbk29N4npwjW6VG84KS2A");
      WalletApi walletApi = new WalletApi(walletFile);
      walletApi.setLogin(null);

      String result = walletApi.sendCoinForCli(OWNER, TO, 1L, true);

      Assert.assertNull(result);
      Assert.assertEquals("Failed to query account.", WalletApi.consumeLastCliOperationError());
    } finally {
      WalletApi.setApiCli(originalApiCli);
    }
  }
}
