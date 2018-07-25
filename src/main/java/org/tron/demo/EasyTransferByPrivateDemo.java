package org.tron.demo;

import java.util.Arrays;
import org.tron.api.GrpcAPI.AddressPrKeyPairMessage;
import org.tron.api.GrpcAPI.EasyTransferResponse;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.Sha256Hash;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.Utils;
import org.tron.keystore.Wallet;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.WalletClient;

public class EasyTransferByPrivateDemo {

  public static void main(String[] args) {
    String privateKey = "D95611A9AF2A2A45359106222ED1AFED48853D9A44DEFF8DC7913F5CBA727366";
    String toAddress = "TKMZBoWbXbYedcBnQugYT7DaFnSgi9qg78";
    EasyTransferResponse response = WalletClient
        .easyTransferByPrivate(ByteArray.fromHexString(privateKey),
            WalletClient.decodeFromBase58Check(toAddress), 1000000L);

    if (response.getResult().getResult() == true) {
      Transaction transaction = response.getTransaction();
      System.out.println("Easy transfer successful!!!");
      System.out.println(
          "Receive txid = " + ByteArray.toHexString(response.getTxid().toByteArray()));
      System.out.println(Utils.printTransaction(transaction));
    } else {
      System.out.println("Easy transfer failed!!!");
      System.out.println("Code = " + response.getResult().getCode());
      System.out.println("Message = " + response.getResult().getMessage().toStringUtf8());
    }
  }
}
