package org.tron.walletcli;

import com.google.protobuf.ByteString;
import org.junit.Assert;
import org.junit.Test;
import org.tron.common.enums.NetType;
import org.tron.trident.proto.Response;
import org.tron.walletserver.ApiClient;
import org.tron.walletserver.WalletApi;


public class WalletApiWrapperTest {

  private static final byte[] OWNER =
      WalletApi.decodeFromBase58Check("TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL");
  private static final byte[] CONTRACT =
      WalletApi.decodeFromBase58Check("TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf");

  private static class StubApiClient extends ApiClient {
    private Response.TransactionExtention constantContractResult;
    private byte[] lastOwner;
    private byte[] lastContract;
    private byte[] lastData;

    StubApiClient() {
      super(NetType.NILE);
    }

    @Override
    public Response.TransactionExtention triggerConstantContract(
        byte[] owner,
        byte[] contractAddress,
        byte[] data,
        long callValue,
        long tokenValue,
        String tokenId) {
      lastOwner = owner;
      lastContract = contractAddress;
      lastData = data;
      return constantContractResult;
    }
  }

  @Test
  public void computeBufferedFeeLimitAddsTwentyPercentBuffer() {
    Assert.assertEquals(120L, WalletApiWrapper.computeBufferedFeeLimit(10L, 10L));
  }

  @Test(expected = ArithmeticException.class)
  public void computeBufferedFeeLimitFailsOnOverflow() {
    WalletApiWrapper.computeBufferedFeeLimit(Long.MAX_VALUE, 2L);
  }

  @Test
  public void getUsdtBalanceAllowsNoAuthWhenAddressProvided() throws Exception {
    ApiClient originalApiCli = WalletApi.getApiCli();
    NetType originalNetwork = WalletApi.getCurrentNetwork();
    StubApiClient stub = new StubApiClient();
    Response.TransactionExtention.Builder constantBuilder = Response.TransactionExtention.newBuilder();
    constantBuilder.getResultBuilder().setResult(true);
    constantBuilder.addConstantResult(ByteString.copyFrom(new byte[]{0x7b}));
    stub.constantContractResult = constantBuilder.build();
    WalletApi.setApiCli(stub);
    WalletApi.setCurrentNetwork(NetType.NILE);

    try {
      WalletApiWrapper wrapper = new WalletApiWrapper();
      org.apache.commons.lang3.tuple.Triple<Boolean, Long, Long> result = wrapper.getUSDTBalance(OWNER);

      Assert.assertTrue(result.getLeft());
      Assert.assertEquals(123L, result.getRight().longValue());
      Assert.assertArrayEquals(OWNER, stub.lastOwner);
      Assert.assertArrayEquals(CONTRACT, stub.lastContract);
      Assert.assertNotNull(stub.lastData);
    } finally {
      WalletApi.setApiCli(originalApiCli);
      WalletApi.setCurrentNetwork(originalNetwork);
    }
  }







}
