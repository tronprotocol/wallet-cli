package org.tron.demo;

import java.util.Arrays;
import org.tron.api.GrpcAPI.EasyTransferResponse;
import org.tron.api.GrpcAPI.TransactionExtention;
import org.tron.api.GrpcAPI.TransactionSignWeight;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.Utils;
import org.tron.protos.Contract;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.WalletApi;

public class MultiSignDemo {

  public static void main(String[] args) {
    String to = "TL5mpGbtr5L2Gi7CtotBQzjN8pK7SmbyFz";
    String owner = "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW";
    String private0 = "D95611A9AF2A2A45359106222ED1AFED48853D9A44DEFF8DC7913F5CBA727366";
    String private1 = "cba92a516ea09f620a16ff7ee95ce0df1d56550a8babe9964981a7144c8a784a";
    String private2 = "8E812436A0E3323166E1F0E8BA79E19E217B2C4A53C970D4CCA0CFB1078979DF";
    long amount = 10_000_000_000L;
    Transaction transaction = TransactionSignDemo
        .createTransaction(WalletApi.decodeFromBase58Check(owner),
            WalletApi.decodeFromBase58Check(to), amount);
    TransactionExtention transactionExtention = WalletApi
        .addSignByApi(transaction, ByteArray.fromHexString(private0));
   // System.out.println(Utils.printTransaction(transactionExtention));
    TransactionSignWeight transactionSignWeight = WalletApi
        .getTransactionSignWeight(transactionExtention.getTransaction());
    System.out.println(Utils.printTransactionSignWeight(transactionSignWeight));

    transactionExtention = WalletApi
        .addSignByApi(transactionExtention.getTransaction(), ByteArray.fromHexString(private1));
    System.out.println(Utils.printTransaction(transactionExtention));
    transactionSignWeight = WalletApi
        .getTransactionSignWeight(transactionExtention.getTransaction());
    System.out.println(Utils.printTransactionSignWeight(transactionSignWeight));

    transactionExtention = WalletApi
        .addSignByApi(transactionExtention.getTransaction(), ByteArray.fromHexString(private2));
    System.out.println(Utils.printTransactionSignWeight(transactionSignWeight));
 //   System.out.println(Utils.printTransaction(transactionExtention));
  }
}
