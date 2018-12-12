package org.tron.walletcli;

import com.google.protobuf.InvalidProtocolBufferException;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.spongycastle.util.encoders.Hex;
import org.tron.api.GrpcAPI.BlockList;
import org.tron.protos.Protocol;
import org.tron.protos.Protocol.Block;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.Protocol.Transaction.Contract.ContractType;
import org.tron.walletserver.GrpcClient;
import org.tron.walletserver.WalletApi;


public class GetAllTransaction {

  public static List<Transaction> transactions = new ArrayList<>();

  public static Transaction HexStringToTransaction(String HexString){
    Transaction signedTransaction = null;
    try {
      signedTransaction = Transaction.parseFrom(Hex.decode(HexString));
    } catch (InvalidProtocolBufferException ignore) {
      System.out.println(HexString);
    }
    return signedTransaction;
  }

  public static String TransactionToHexString(Transaction trx){
    String hexString = Hex.toHexString(trx.toByteArray());
    return hexString;
  }

  public static void main(String[] args) {

    GrpcClient client = WalletApi.init();
    int startBlockNum = 4829000;
    int endBlockNum = 4835000;
    int step = 100;
    System.out.println(String.format("提取从%s块～～%s块的交易!", startBlockNum, endBlockNum));
    for (int i = startBlockNum; i < endBlockNum; i = i + step) {
      Optional<BlockList> result = client.getBlockByLimitNext(i, i + step);
      if (result.isPresent()) {
        BlockList blockList = result.get();
        if (blockList.getBlockCount() > 0) {
          for (Block block : blockList.getBlockList()) {
            if (block.getTransactionsCount() > 0) {
              transactions.addAll(block.getTransactionsList());
            }
          }
        }
      }
      System.out.println(String.format("已提取%s块～～%s块的交易!", i, i+step));
    }

    System.out.println("总交易数量：" + transactions.size());
    transactions = transactions.stream().filter(new Predicate<Transaction>() {
      @Override
      public boolean test(Transaction transaction) {
        ContractType type = transaction.getRawData().getContract(0).getType();
        return type == ContractType.TransferContract
            || type == ContractType.TransferAssetContract
            || type == ContractType.AccountCreateContract
            || type == ContractType.VoteAssetContract
            || type == ContractType.AssetIssueContract
            || type == ContractType.ParticipateAssetIssueContract
            || type == ContractType.FreezeBalanceContract
            || type == ContractType.UnfreezeBalanceContract
            || type == ContractType.UnfreezeAssetContract
            || type == ContractType.UpdateAssetContract
            || type == ContractType.ProposalCreateContract
            || type == ContractType.ProposalApproveContract
            || type == ContractType.ProposalDeleteContract
            || type == ContractType.SetAccountIdContract
            || type == ContractType.CustomContract
            || type == ContractType.CreateSmartContract
            || type == ContractType.TriggerSmartContract
            || type == ContractType.ExchangeCreateContract
            || type == ContractType.UpdateSettingContract
            || type == ContractType.ExchangeInjectContract
            || type == ContractType.ExchangeWithdrawContract
            || type == ContractType.ExchangeTransactionContract
            || type == ContractType.UpdateEnergyLimitContract
            ;
      }
    }).collect(Collectors.toList());
    System.out.println("满足交易数量：" + transactions.size());

    long t1 = System.currentTimeMillis();
    List<String> trxLists = new ArrayList<>();
    for (Transaction trx : transactions) {
      trxLists.add(TransactionToHexString(trx));
    }
    System.out.println("转换HexString花费" + String.valueOf(System.currentTimeMillis() - t1) + "ms");

    try {
      long t2 = System.currentTimeMillis();
      System.out.println("开始向文件写入交易数据，请稍后...");
      String filename = "MyTrx.txt";
      FileWriter fw = new FileWriter(filename, true); //the true will append the new data

      OutputStreamWriter write = new OutputStreamWriter(new FileOutputStream(new File(filename)));
      BufferedWriter writer = new BufferedWriter(write);

      transactions.parallelStream().forEachOrdered(new Consumer<Transaction>() {
        @Override
        public void accept(Transaction trx) {
          try {
            writer.write(TransactionToHexString(trx) + System.lineSeparator());
          } catch (InvalidProtocolBufferException e) {
            e.printStackTrace();
          } catch (IOException ioe){
            ioe.printStackTrace();
          }
        }
      });
      writer.flush();
      write.close();
      writer.close();
      /*for (String str : trxLists) {
        try {
          Transaction signedTransaction = Transaction.parseFrom(Hex.decode(str));
          String hex = Hex.toHexString(signedTransaction.toByteArray());
          fw.write(hex + '\n');
        } catch (InvalidProtocolBufferException ignore) {
          System.out.println("trx decode error");
        }
      }*/
      //fw.close();
      System.out.println("交易数据写入完成，文件名称："+ filename);
      System.out.println("写入文件花费" + String.valueOf(System.currentTimeMillis() - t2) + "ms");
    } catch (IOException ioe) {
      System.err.println("IOException: " + ioe.getMessage());
    }
  }
}
