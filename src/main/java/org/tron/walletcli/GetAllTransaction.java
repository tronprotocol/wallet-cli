package org.tron.walletcli;

import com.google.protobuf.InvalidProtocolBufferException;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.spongycastle.util.encoders.Hex;
import org.tron.api.GrpcAPI.BlockList;
import org.tron.api.GrpcAPI.ExchangeList;
import org.tron.protos.Protocol.Block;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.Protocol.Transaction.Contract.ContractType;
import org.tron.walletserver.GrpcClient;
import org.tron.walletserver.WalletApi;


public class GetAllTransaction {

  public static List<Transaction> transactions = new ArrayList<>();

  public static Transaction HexStringToTransaction(String HexString) {
    Transaction signedTransaction = null;
    try {
      signedTransaction = Transaction.parseFrom(Hex.decode(HexString));
    } catch (InvalidProtocolBufferException ignore) {
      System.out.println(HexString);
    }
    return signedTransaction;
  }

  public static String TransactionToHexString(Transaction trx) {
    String hexString = Hex.toHexString(trx.toByteArray());
    return hexString;
  }

  public static void fetchTransaction(GrpcClient client, String filename, int startBlockNum,
      int endBlockNum) {
    int step = 100;
    Optional<ExchangeList> eList = client.listExchanges();
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
      System.out.println(String.format("已提取%s块～～%s块的交易!", i, i + step));
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

    /*long t1 = System.currentTimeMillis();
    List<String> trxLists = new ArrayList<>();
    for (Transaction trx : transactions) {
      trxLists.add(TransactionToHexString(trx));
    }
    System.out.println("转换HexString花费" + String.valueOf(System.currentTimeMillis() - t1) + "ms");
*/
    try {
      long t2 = System.currentTimeMillis();
      System.out.println("开始向文件写入交易数据，请稍后...");
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
          } catch (IOException ioe) {
            ioe.printStackTrace();
          }
        }
      });
      writer.flush();
      write.close();
      writer.close();

      System.out.println("交易数据写入完成，文件名称：" + filename);
      System.out.println("写入文件花费" + String.valueOf(System.currentTimeMillis() - t2) + "ms");
    } catch (IOException ioe) {
      System.err.println("IOException: " + ioe.getMessage());
    }

  }

  public static void sendTransaction(List<GrpcClient> clients, String filename) {

    List<Transaction> transactionList = new ArrayList<>();
    ThreadPoolExecutor executor = new ThreadPoolExecutor(17, 17, 200, TimeUnit.MILLISECONDS,
        new LinkedBlockingQueue<Runnable>());

    try {
      FileReader fr = new FileReader(filename);
      InputStreamReader read = new InputStreamReader(new FileInputStream(new File(filename)));
      BufferedReader reader = new BufferedReader(read);
      String trx = reader.readLine();
      while (trx != null) {
        transactionList.add(HexStringToTransaction(trx));
        trx = reader.readLine();
      }
    } catch (FileNotFoundException e) {
      e.printStackTrace();
    } catch (IOException ioe) {
      ioe.printStackTrace();
    }

    System.out.println("Start send time is " + System.currentTimeMillis());
    // 线程池发送
    for (int i = 0; i < transactionList.size(); i++) {
      executor.execute(new MyTask(transactionList.get(i), clients.get(i % clients.size())));
    }
    System.out.println("End send time is " + System.currentTimeMillis());

    boolean flag = true;
    Integer i = 0;
    Long progressTaskNum = -1L;
    while (i++ < 3600) {
      try {
        Thread.sleep(10000);
      } catch (InterruptedException e) {
        flag = false;
      }
      if (progressTaskNum == executor.getCompletedTaskCount()) {
        System.exit(1);
      }
      progressTaskNum = executor.getCompletedTaskCount();
      System.out.println(executor.getCompletedTaskCount());
    }
  }

  public static void main(String[] args) {

    List<GrpcClient> clients = new ArrayList<>();
    GrpcClient client1 = WalletApi.init(0);
    GrpcClient client2 = WalletApi.init(0);
    GrpcClient client3 = WalletApi.init(1);
    GrpcClient client4 = WalletApi.init(1);
    GrpcClient client5 = WalletApi.init(2);
    GrpcClient client6 = WalletApi.init(3);
    GrpcClient client7 = WalletApi.init(4);
    //GrpcClient client8 = WalletApi.init(3);
    //GrpcClient client9 = WalletApi.init(4);
    //GrpcClient client10 = WalletApi.init(5);
    //GrpcClient client11 = WalletApi.init(6);
    clients.add(client1);
    clients.add(client2);
    clients.add(client3);
    clients.add(client4);
    clients.add(client5);
    clients.add(client6);
    clients.add(client7);
    //clients.add(client8);
    //clients.add(client9);
    //clients.add(client10);
    //clients.add(client11);

    /*GrpcClient client2 = new GrpcClient("47.52.254.128:50051", "");
    clients.add(client2);
    GrpcClient client3 = new GrpcClient("47.52.254.128:50051", "");
    clients.add(client3);
    GrpcClient client4 = new GrpcClient("47.52.254.128:50051", "");
    clients.add(client4);


    GrpcClient client5 = new GrpcClient("47.90.210.159:50051", "");
    clients.add(client5);
    GrpcClient client6 = new GrpcClient("47.90.210.159:50051", "");
    clients.add(client6);
    GrpcClient client7 = new GrpcClient("47.90.210.159:50051", "");
    clients.add(client7);
    GrpcClient client8 = new GrpcClient("47.90.210.159:50051", "");
    clients.add(client8);

    GrpcClient client9 = new GrpcClient("47.90.248.142:50051", "");
    clients.add(client9);
    GrpcClient client10 = new GrpcClient("47.90.248.142:50051", "");
    clients.add(client10);
    GrpcClient client11 = new GrpcClient("47.90.248.142:50051", "");
    clients.add(client11);
    GrpcClient client12 = new GrpcClient("47.90.248.142:50051", "");
    clients.add(client12);*/

    //获取线上的历史真实交易
    //fetchTransaction(client1, "block-200000-202000.txt",5260000, 5270000);
    //fetchTransaction(client2, "MyTrxV3.1.3.txt",4014118, 4034118);

    // GrpcClient client2 = new GrpcClient("47.90.210.159:50051", "");
    // GrpcClient client3 = new GrpcClient("47.90.248.142:50051", "");
    //
    // GrpcClient client4 = new GrpcClient("47.52.254.128:50051", "");
    // GrpcClient client5 = new GrpcClient("47.90.248.142:50051", "");
    // GrpcClient client6 = new GrpcClient("47.90.210.159:50051", "");
    //
    // GrpcClient client7 = new GrpcClient("47.52.254.128:50051", "");
    // GrpcClient client8 = new GrpcClient("47.90.210.159:50051", "");
    // GrpcClient client9 = new GrpcClient("47.90.248.142:50051", "");
    //
    // GrpcClient client10 = new GrpcClient("47.52.254.128:50051", "");
    // GrpcClient client11 = new GrpcClient("47.90.248.142:50051", "");
    // GrpcClient client12 = new GrpcClient("47.90.210.159:50051", "");
    //
    // clients.add(client4);
    // clients.add(client5);
    // clients.add(client6);
    // clients.add(client7);
    // clients.add(client8);
    // clients.add(client9);
    // clients.add(client10);
    // clients.add(client11);
    // clients.add(client12);


    sendTransaction(clients, "/data/workspace/replay_workspace/getTransactions.txt");
    //将历史交易重放到测试环境下，测试节点取消交易验证和Tapos验证



  }
}
