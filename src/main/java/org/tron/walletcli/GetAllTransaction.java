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

  public static void fetchTransaction(GrpcClient client, String filename, int startBlockNum, int endBlockNum) {
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

  public static void sendTransaction(GrpcClient client, String filename) {

    List<Transaction> transactionList = new ArrayList<>();
    ThreadPoolExecutor executor = new ThreadPoolExecutor(10, 20, 200, TimeUnit.MILLISECONDS,
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

    // 线程池发送
    for (int i = 0; i < transactionList.size(); i++) {
      executor.execute(new MyTask(transactionList.get(i), client));
    }

    boolean flag = true;
    while(flag) {
      try{
        Thread.sleep(10000);
      }catch (InterruptedException e){
        flag = false;
      }
      System.out.println(executor.getCompletedTaskCount());
    }
  }

  public static void main(String[] args) {

    GrpcClient client = WalletApi.init();
    //获取线上的历史真实交易
    //fetchTransaction(client, "MyTrxV3.2.2.txt",4828777, 4848777);
    //fetchTransaction(client, "MyTrxV3.1.3.txt",4014118, 4034118);


    //GrpcClient sendClient = new GrpcClient("47.52.253.32:50051","");
    //将历史交易重放到测试环境下，测试节点取消交易验证和Tapos验证
    sendTransaction(client, "MyTrxV3.2.2.txt");
    //sendTransaction(client, "MyTrxV3.1.3.txt");

  }
}
