package org.tron.common.utils;

import com.alibaba.fastjson.JSONObject;
import com.google.protobuf.Any;
import com.google.protobuf.ByteString;
import org.junit.Assert;
import org.junit.BeforeClass;
import org.junit.Test;
import org.tron.api.GrpcAPI.TransactionExtention;
import org.tron.api.GrpcAPI.TransactionSignWeight;
import org.tron.protos.Protocol;
import org.tron.protos.contract.BalanceContract.TransferContract;
import org.tron.trident.proto.Chain;
import org.tron.trident.proto.Response;
import org.tron.walletcli.Client;

/**
 * Transaction rendering runs protobuf output through JSON.parseObject, and a Transaction carries its
 * contract in a protobuf Any. Safe mode rejects any payload containing "@type", so this guards that
 * our JsonFormat never emits that key and transaction display keeps working.
 */
public class TransactionJsonSafeModeTest {

  @BeforeClass
  public static void enableSafeMode() throws Exception {
    Class.forName(Client.class.getName());
  }

  private static Protocol.Transaction transferTransaction() {
    TransferContract transfer = TransferContract.newBuilder()
        .setOwnerAddress(ByteString.copyFrom(new byte[]{0x41, 0x01, 0x02, 0x03}))
        .setToAddress(ByteString.copyFrom(new byte[]{0x41, 0x04, 0x05, 0x06}))
        .setAmount(1_000_000L)
        .build();
    Protocol.Transaction.Contract contract = Protocol.Transaction.Contract.newBuilder()
        .setType(Protocol.Transaction.Contract.ContractType.TransferContract)
        .setParameter(Any.pack(transfer))
        .build();
    return Protocol.Transaction.newBuilder()
        .setRawData(Protocol.Transaction.raw.newBuilder()
            .setTimestamp(1_700_000_000_000L)
            .addContract(contract))
        .build();
  }

  @Test
  public void printsTransactionWithProtobufAnyUnderSafeMode() {
    JSONObject json = Utils.printTransactionToJSON(transferTransaction(), true);

    Assert.assertNotNull(json);
    Assert.assertFalse("JsonFormat must not emit an @type key", json.toJSONString().contains("@type"));
    Assert.assertTrue(json.toJSONString().contains("contract"));
  }

  @Test
  public void printsTransactionStringUnderSafeMode() {
    String text = Utils.printTransaction(transferTransaction());

    Assert.assertNotNull(text);
    Assert.assertFalse(text.contains("@type"));
  }

  @Test
  public void printsTransactionSignWeightUnderSafeMode() {
    TransactionSignWeight signWeight = TransactionSignWeight.newBuilder()
        .setTransaction(TransactionExtention.newBuilder()
            .setTransaction(transferTransaction()))
        .build();

    String text = Utils.printTransactionSignWeight(signWeight);

    Assert.assertNotNull(text);
    Assert.assertFalse(text.contains("@type"));
  }

  @Test
  public void printsTransactionApprovedListUnderSafeMode() throws Exception {
    Response.TransactionApprovedList approved = Response.TransactionApprovedList.newBuilder()
        .setTransaction(Response.TransactionExtention.newBuilder()
            .setTransaction(Chain.Transaction.parseFrom(transferTransaction().toByteArray())))
        .build();

    String text = Utils.printTransactionApprovedList(approved);

    Assert.assertNotNull(text);
    Assert.assertFalse(text.contains("@type"));
  }
}
