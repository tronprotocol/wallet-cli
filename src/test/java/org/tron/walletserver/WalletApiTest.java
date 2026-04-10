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

  @Test
  public void sendCoinForCliReturnsFalseWhenAccountQueryFails() throws Exception {
    ApiClient originalApiCli = WalletApi.getApiCli();
    StubApiClient stub = new StubApiClient();
    stub.queryAccountResult = null;
    WalletApi.setApiCli(stub);

    try {
      WalletFile walletFile = new WalletFile();
      walletFile.setAddress("TQsVqVAnvbFdLcbk29N4npwjW6VG84KS2A");
      WalletApi walletApi = new WalletApi(walletFile);
      walletApi.setLogin(null);

      boolean result = walletApi.sendCoinForCli(OWNER, TO, 1L, true);

      Assert.assertFalse(result);
      Assert.assertEquals("Failed to query account.", WalletApi.consumeLastCliOperationError());
    } finally {
      WalletApi.setApiCli(originalApiCli);
    }
  }
}
