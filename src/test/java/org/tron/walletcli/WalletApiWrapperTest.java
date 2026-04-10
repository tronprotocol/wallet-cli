package org.tron.walletcli;

import com.google.protobuf.ByteString;
import org.junit.Assert;
import org.junit.Test;
import org.tron.common.enums.NetType;
import org.tron.keystore.WalletFile;
import org.tron.trident.proto.Response;
import org.tron.walletcli.cli.CommandErrorException;
import org.tron.walletserver.ApiClient;
import org.tron.walletserver.WalletApi;

public class WalletApiWrapperTest {

  private static final byte[] OWNER =
      WalletApi.decodeFromBase58Check("TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL");
  private static final byte[] CONTRACT =
      WalletApi.decodeFromBase58Check("TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf");

  private static class StubApiClient extends ApiClient {
    private Response.TransactionExtention constantContractResult;
    private Response.EstimateEnergyMessage estimateEnergyResult;
    private Response.Account queryAccountResult;
    private byte[] lastOwner;
    private byte[] lastContract;
    private byte[] lastData;
    private byte[] lastQueryAddress;

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

    @Override
    public Response.EstimateEnergyMessage estimateEnergy(
        byte[] owner,
        byte[] contractAddress,
        long callValue,
        byte[] data,
        long tokenValue,
        String tokenId) {
      lastOwner = owner;
      lastContract = contractAddress;
      lastData = data;
      return estimateEnergyResult;
    }

    @Override
    public Response.Account queryAccount(byte[] address) {
      lastQueryAddress = address;
      return queryAccountResult;
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

  @Test
  public void triggerConstantContractExtentionAllowsNoAuthWhenOwnerProvided() {
    ApiClient originalApiCli = WalletApi.getApiCli();
    StubApiClient stub = new StubApiClient();
    Response.TransactionExtention.Builder constantBuilder = Response.TransactionExtention.newBuilder();
    constantBuilder.getResultBuilder().setResult(true);
    stub.constantContractResult = constantBuilder.build();
    WalletApi.setApiCli(stub);

    try {
      WalletApiWrapper wrapper = new WalletApiWrapper();
      Response.TransactionExtention result =
          wrapper.triggerConstantContractExtention(OWNER, CONTRACT, 0L, new byte[]{0x01}, 0L, "");

      Assert.assertNotNull(result);
      Assert.assertArrayEquals(OWNER, stub.lastOwner);
      Assert.assertArrayEquals(CONTRACT, stub.lastContract);
    } finally {
      WalletApi.setApiCli(originalApiCli);
    }
  }

  @Test
  public void estimateEnergyMessageAllowsNoAuthWhenOwnerProvided() {
    ApiClient originalApiCli = WalletApi.getApiCli();
    StubApiClient stub = new StubApiClient();
    Response.EstimateEnergyMessage.Builder estimateBuilder = Response.EstimateEnergyMessage.newBuilder();
    estimateBuilder.getResultBuilder().setResult(true);
    estimateBuilder.setEnergyRequired(321L);
    stub.estimateEnergyResult = estimateBuilder.build();
    WalletApi.setApiCli(stub);

    try {
      WalletApiWrapper wrapper = new WalletApiWrapper();
      Response.EstimateEnergyMessage result =
          wrapper.estimateEnergyMessage(OWNER, CONTRACT, 0L, new byte[]{0x02}, 0L, "");

      Assert.assertNotNull(result);
      Assert.assertEquals(321L, result.getEnergyRequired());
      Assert.assertArrayEquals(OWNER, stub.lastOwner);
      Assert.assertArrayEquals(CONTRACT, stub.lastContract);
    } finally {
      WalletApi.setApiCli(originalApiCli);
    }
  }

  @Test
  public void queryAccountUsesProvidedAddressWhenLoggedIn() {
    ApiClient originalApiCli = WalletApi.getApiCli();
    StubApiClient stub = new StubApiClient();
    stub.queryAccountResult = Response.Account.newBuilder().build();
    WalletApi.setApiCli(stub);

    try {
      WalletFile walletFile = new WalletFile();
      walletFile.setAddress("TQsVqVAnvbFdLcbk29N4npwjW6VG84KS2A");
      WalletApi walletApi = new WalletApi(walletFile);
      walletApi.setLogin(null);

      WalletApiWrapper wrapper = new WalletApiWrapper();
      wrapper.setWallet(walletApi);

      Response.Account result = wrapper.queryAccount(OWNER);

      Assert.assertNotNull(result);
      Assert.assertArrayEquals(OWNER, stub.lastQueryAddress);
    } finally {
      WalletApi.setApiCli(originalApiCli);
    }
  }

  @Test
  public void throwIfCliOperationFailedUsesCapturedCliErrorDetail() {
    WalletApiWrapper wrapper = new WalletApiWrapper() {
      @Override
      protected String consumeLastCliOperationError() {
        return "CONTRACT_VALIDATE_ERROR, Contract validate error : Proposal[1] expired";
      }
    };

    try {
      wrapper.throwIfCliOperationFailed(false, "ApproveProposal failed !!");
      Assert.fail("Expected CLI failure");
    } catch (CommandErrorException e) {
      Assert.assertEquals("execution_error", e.getCode());
      Assert.assertEquals(
          "CONTRACT_VALIDATE_ERROR, Contract validate error : Proposal[1] expired",
          e.getMessage());
    }
  }

  @Test
  public void throwIfCliOperationFailedFallsBackWhenNoCliErrorDetailExists() {
    WalletApiWrapper wrapper = new WalletApiWrapper() {
      @Override
      protected String consumeLastCliOperationError() {
        return null;
      }
    };

    try {
      wrapper.throwIfCliOperationFailed(false, "ApproveProposal failed !!");
      Assert.fail("Expected CLI failure");
    } catch (CommandErrorException e) {
      Assert.assertEquals("execution_error", e.getCode());
      Assert.assertEquals("ApproveProposal failed !!", e.getMessage());
    }
  }
}
