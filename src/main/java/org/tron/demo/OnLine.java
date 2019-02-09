package org.tron.demo;

import com.google.protobuf.ByteString;
import com.google.protobuf.InvalidProtocolBufferException;
import com.google.rpc.Code;
import com.typesafe.config.Config;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.util.Date;
import java.util.Random;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.tron.api.GrpcAPI.Return;
import org.tron.api.GrpcAPI.Return.response_code;
import org.tron.api.GrpcAPI.TransactionExtention;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.Utils;
import org.tron.core.config.Configuration;
import org.tron.core.exception.CancelException;
import org.tron.core.exception.CipherException;
import org.tron.protos.Contract;
import org.tron.protos.Contract.AssetIssueContract;
import org.tron.protos.Contract.TransferAssetContract;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.Protocol.Transaction.Contract.ContractType;
import org.tron.walletserver.GrpcClient;
import org.tron.walletserver.WalletApi;

public class OnLine {

  private static int addressNumber;
  private static byte[] owner = null;

  private static final Logger logger = LoggerFactory.getLogger("Client");
  private static String assetId;
  private static File addressFile = new File("address.txt");
  private static File transactionFile = new File("transaction.txt");
  private static File transactionSignedFile = new File("transactionSigned.txt");
  private static File balanceFile = new File("balance.txt");
  private static File logs = new File("logs.txt");
  private static boolean randAmount = false;
  private static GrpcClient rpcCli = null;

  private static Transaction createTransaction(Contract.TransferAssetContract contract) {
    Transaction transaction = rpcCli.createTransferAssetTransaction(contract);
    Transaction.raw rawData = transaction.getRawData().toBuilder()
        .setExpiration(System.currentTimeMillis() + 60 * 60 * 1000L).build(); //1h
    transaction = transaction.toBuilder().setRawData(rawData).build();
    return transaction;
  }

  private static void initConfig() {
    Config config = Configuration.getByPath("config-on.conf");

    if (config.hasPath("AddressNum")) {
      String keyNum = config.getString("AddressNum");
      addressNumber = Integer.parseInt(keyNum);
    } else {
      addressNumber = 300;
    }
    if (config.hasPath("address")) {
      String address = config.getString("address");
      owner = WalletApi.decodeFromBase58Check(address);
    }

    String fullNode = "";
    String solidityNode = "";
    if (config.hasPath("soliditynode.ip.list")) {
      solidityNode = config.getStringList("soliditynode.ip.list").get(0);
    }
    if (config.hasPath("fullnode.ip.list")) {
      fullNode = config.getStringList("fullnode.ip.list").get(0);
    }
    if (config.hasPath("assertId")) {
      assetId = config.getString("assertId");
    }

    if (config.hasPath("rand_amount")) {
      randAmount = config.getBoolean("rand_amount");
    }
    rpcCli = new GrpcClient(fullNode, solidityNode);
  }

  private static boolean broadcastTransaction(Transaction transaction) {
    return rpcCli.broadcastTransaction(transaction);
  }

  private static long getBalance(byte[] address) {
    Account account = WalletApi.queryAccount(address);
    long balance = 0;
    if (account != null && account.getAssetV2().containsKey(assetId)) {
      balance = account.getAssetV2().get(assetId);
    }
    logger.info(WalletApi.encode58Check(address) + "'s balance is " + balance);
    return balance;
  }

  private static Transaction createTransaction(byte[] owner, byte[] toAddress, long amount) {
    Contract.TransferAssetContract contract = WalletApi
        .createTransferAssetContract(toAddress, assetId.getBytes(), owner, amount);
    Transaction transaction = createTransaction(contract);
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      System.out.println(
          "Create transaction transfer " + amount + " " + assetId + " to " + WalletApi
              .encode58Check(toAddress)
              + " failed !!!");
      return null;
    }

    System.out.println(
        "Create transaction transfer " + amount + " " + assetId + " to " + WalletApi
            .encode58Check(toAddress)
            + " successful !!!");
    return transaction;
  }

  private static Transaction createAssetIssue(AssetIssueContract contract) {
    TransactionExtention transaction = rpcCli.createAssetIssue2(contract);
    if (transaction== null || transaction.getResult().getCode() != response_code.SUCCESS) {
      System.out.println(
          "Create transaction issue " + contract.getName().toStringUtf8() + " failed !!!");
      System.out.println("Code : " + transaction.getResult().getCode() + " Message : " + transaction.getResult().getMessage().toStringUtf8() );
      return null;
    }

    System.out.println(
        "Create transaction issue " + contract.getName().toStringUtf8() + " successful !!!");


    Transaction.raw rawData = transaction.getTransaction().getRawData().toBuilder()
        .setExpiration(System.currentTimeMillis() + 60 * 60 * 1000L).build(); //1h
    Transaction transaction1 = transaction.getTransaction().toBuilder().setRawData(rawData).build();
    return transaction1;
  }

  private static long getRandomAmmount(long blance, int num) {
    if (num == 1) {
      return blance;
    }
    long ammout = blance / num;

    long random = new Random().nextLong();
    random = random % ammout / 2;  //-0.5ammount< random < 0.5ammount
    return random + ammout;  //[0.5amount, 1.5ammount]
  }

  private static void issueAsset() throws IOException { Config config = Configuration.getByPath("config-on.conf");
    String assertName = config.getString("assertName");
    String abbr = config.getString("abbr");
    long totalSupply = config.getLong("totalSupply");
    int precision = config.getInt("precision");
    int trxNum = config.getInt("trxNum");
    int tokenNum = config.getInt("tokenNum");
    String startYyyyMmDd = config.getString("startYyyyMmDd");
    String endYyyyMmDd = config.getString("endYyyyMmDd");
    Date startDate = Utils.strToDateLong(startYyyyMmDd);
    Date endDate = Utils.strToDateLong(endYyyyMmDd);
    long startTime = startDate.getTime();
    long endTime = endDate.getTime();
    String description = config.getString("description");
    String url = config.getString("url");
    int freeNetLimitPerAccount = config.getInt("freeNetLimitPerAccount");
    int publicFreeNetLimitString = config.getInt("publicFreeNetLimit");

    long freeAssetNetLimit = new Long(freeNetLimitPerAccount);
    long publicFreeNetLimit = new Long(publicFreeNetLimitString);

    AssetIssueContract.Builder builder = AssetIssueContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setName(ByteString.copyFrom(assertName.getBytes()));
    builder.setAbbr(ByteString.copyFrom(abbr.getBytes()));
    builder.setTotalSupply(totalSupply);
    builder.setTrxNum(trxNum);
    builder.setPrecision(precision);
    builder.setNum(tokenNum);
    builder.setStartTime(startTime);
    builder.setEndTime(endTime);
    builder.setDescription(ByteString.copyFrom(description.getBytes()));
    builder.setUrl(ByteString.copyFrom(url.getBytes()));
    builder.setFreeAssetNetLimit(freeAssetNetLimit);
    builder.setPublicFreeAssetNetLimit(publicFreeNetLimit);
    Transaction transaction = createAssetIssue(builder.build());

    FileOutputStream transactionFOS = null;
    OutputStreamWriter transactionOSW = null;

    try {
      transactionFOS = new FileOutputStream(transactionFile);
      transactionOSW = new OutputStreamWriter(transactionFOS);

      transactionOSW.append("1 \n");
      transactionOSW.append(ByteArray.toHexString(transaction.toByteArray()) + "\n");
    } catch (IOException e) {
      throw e;
    } finally {
      if (transactionOSW != null) {
        transactionOSW.close();
      }
      if (transactionFOS != null) {
        transactionFOS.close();
      }
    }
  }

  private static void createTransaction() throws IOException {
    long totalBalance = getBalance(owner);
    FileInputStream inputStream = null;
    InputStreamReader inputStreamReader = null;
    BufferedReader bufferedReader = null;
    FileOutputStream transactionFOS = null;
    OutputStreamWriter transactionOSW = null;

    try {
      inputStream = new FileInputStream(addressFile);
      inputStreamReader = new InputStreamReader(inputStream);
      bufferedReader = new BufferedReader(inputStreamReader);

      transactionFOS = new FileOutputStream(transactionFile);
      transactionOSW = new OutputStreamWriter(transactionFOS);

      String address;
      String number;
      int i = addressNumber;
      long amount = totalBalance / i;
      while ((number = bufferedReader.readLine()) != null) {
        address = bufferedReader.readLine();
        if (randAmount) {
          amount = getRandomAmmount(totalBalance, i);
        }
        i--;
        Transaction transaction = createTransaction(owner, WalletApi.decodeFromBase58Check(address),
            amount);
        totalBalance -= amount;
        if (transaction != null) {
          transactionOSW.append(number + "\n");
          transactionOSW.append(ByteArray.toHexString(transaction.toByteArray()) + "\n");
        }
      }
    } catch (IOException e) {
      throw e;
    } finally {
      if (bufferedReader != null) {
        bufferedReader.close();
      }
      if (inputStreamReader != null) {
        inputStreamReader.close();
      }
      if (inputStream != null) {
        inputStream.close();
      }
      if (transactionOSW != null) {
        transactionOSW.close();
      }
      if (transactionFOS != null) {
        transactionFOS.close();
      }
    }
  }

  private static void sendCoin() throws IOException {
    FileInputStream inputStream = null;
    InputStreamReader inputStreamReader = null;
    BufferedReader bufferedReader = null;
    FileOutputStream outputStream = null;
    OutputStreamWriter outputStreamWriter = null;
    try {
      inputStream = new FileInputStream(transactionSignedFile);
      inputStreamReader = new InputStreamReader(inputStream);
      bufferedReader = new BufferedReader(inputStreamReader);

      outputStream = new FileOutputStream(logs);
      outputStreamWriter = new OutputStreamWriter(outputStream);

      String transactionSigned;
      String number;
      while ((number = bufferedReader.readLine()) != null) {
        transactionSigned = bufferedReader.readLine();
        Transaction transaction = Transaction.parseFrom(ByteArray.fromHexString(transactionSigned));
        Transaction.Contract contract = transaction.getRawData().getContract(0);
        if (contract.getType() == ContractType.TransferAssetContract) {
          TransferAssetContract transferContract = contract.getParameter()
              .unpack(TransferAssetContract.class);
          long amount = transferContract.getAmount();
          byte[] toAddress = transferContract.getToAddress().toByteArray();
          String assertId = transferContract.getAssetName().toStringUtf8();
          outputStreamWriter.append(number + "\n");
          if (broadcastTransaction(transaction)) {
            System.out.println(
                "Send " + amount + " " + assertId + " to " + WalletApi.encode58Check(toAddress)
                    + " successful !!!");
            outputStreamWriter.append(amount + " " + WalletApi.encode58Check(toAddress) + "\n");
          } else {
            System.out.println(
                "Send " + amount + " " + assertId + " to " + WalletApi.encode58Check(toAddress)
                    + " failed !!!");
            outputStreamWriter
                .append(amount + " " + WalletApi.encode58Check(toAddress) + " failed !!!" + "\n");
          }
        }
        if (contract.getType() == ContractType.AssetIssueContract) {
          AssetIssueContract assetIssueContract = contract.getParameter()
              .unpack(AssetIssueContract.class);
          String assertName = assetIssueContract.getName().toStringUtf8();
          long totalSupply = assetIssueContract.getTotalSupply();
          outputStreamWriter.append(number + "\n");
          if (broadcastTransaction(transaction)) {
            System.out.println(
                "Issue " + assertName + " totalSupply " + totalSupply + " successful !!!");
            outputStreamWriter.append(assertName + " " + totalSupply + "\n");
          } else {
            System.out.println(
                "Issue " + assertName + " totalSupply " + totalSupply + " failed !!!");
            outputStreamWriter
                .append(assertName + " " + totalSupply + " failed !!!" + "\n");
          }
        }
      }
    } catch (IOException e) {
      throw e;
    } finally {
      if (bufferedReader != null) {
        bufferedReader.close();
      }
      if (inputStreamReader != null) {
        inputStreamReader.close();

      }
      if (inputStream != null) {
        inputStream.close();
      }
      if (outputStreamWriter != null) {
        outputStreamWriter.close();
      }
      if (outputStream != null) {
        outputStream.close();
      }
    }
  }

  private static void queryBalance() throws IOException {
    FileInputStream inputStream = null;
    InputStreamReader inputStreamReader = null;
    BufferedReader bufferedReader = null;

    FileOutputStream outputStream = new FileOutputStream(balanceFile);
    OutputStreamWriter outputStreamWriter = new OutputStreamWriter(outputStream);

    long totalBalance1 = 0;
    try {
      inputStream = new FileInputStream(addressFile);
      inputStreamReader = new InputStreamReader(inputStream);
      bufferedReader = new BufferedReader(inputStreamReader);

      String address;
      String number;
      while ((number = bufferedReader.readLine()) != null) {
        address = bufferedReader.readLine();
        long balance = getBalance(WalletApi.decodeFromBase58Check(address));
        totalBalance1 += balance;
        outputStreamWriter.append(number + "\n");
        outputStreamWriter.append(balance + " " + address + "\n");
      }
    } catch (IOException e) {
      throw e;
    } finally {
      if (bufferedReader != null) {
        bufferedReader.close();
      }
      if (inputStreamReader != null) {
        inputStreamReader.close();
      }
      if (inputStream != null) {
        inputStream.close();
      }
      if (outputStreamWriter != null) {
        outputStreamWriter.close();
      }
      if (outputStream != null) {
        outputStream.close();
      }
    }
    System.out.println(
        "Total balance except " + WalletApi.encode58Check(owner) + " ::: " + totalBalance1);
    totalBalance1 += getBalance(owner);
    System.out.println("Total balance ::: " + totalBalance1);
  }

  public static void main(String[] args) throws IOException {
    initConfig();

    for (String arg : args) {
      System.out.println(arg);
    }
    if (args[0].equals("issue")) {
      issueAsset();
      return;
    }
    if (args[0].equals("create")) {
      createTransaction();
      return;
    }
    if (args[0].equals("send")) {
      sendCoin();
      return;
    }
    if (args[0].equals("query")) {
      queryBalance();
      return;
    }
  }
}
