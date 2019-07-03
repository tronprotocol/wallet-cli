package org.tron.test;

import com.google.protobuf.Any;
import com.google.protobuf.ByteString;
import com.typesafe.config.Config;
import io.netty.util.internal.StringUtil;
import java.util.Optional;
import java.util.Random;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import org.joda.time.DateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.tron.api.GrpcAPI.DecryptNotes;
import org.tron.api.GrpcAPI.DecryptNotesMarked;
import org.tron.api.GrpcAPI.DecryptNotesMarked.NoteTx;
import org.tron.api.GrpcAPI.IvkDecryptAndMarkParameters;
import org.tron.api.GrpcAPI.IvkDecryptParameters;
import org.tron.api.GrpcAPI.Note;
import org.tron.api.GrpcAPI.PrivateParameters;
import org.tron.api.GrpcAPI.ReceiveNote;
import org.tron.api.GrpcAPI.SpendNote;
import org.tron.api.GrpcAPI.TransactionExtention;
import org.tron.common.crypto.ECKey;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.TransactionUtils;
import org.tron.core.zen.ShieldAddressInfo;
import org.tron.core.zen.address.DiversifierT;
import org.tron.core.zen.address.ExpandedSpendingKey;
import org.tron.core.zen.address.FullViewingKey;
import org.tron.core.zen.address.IncomingViewingKey;
import org.tron.core.zen.address.PaymentAddress;
import org.tron.core.zen.address.SpendingKey;
import org.tron.protos.Contract;
import org.tron.protos.Contract.IncrementalMerkleVoucherInfo;
import org.tron.protos.Contract.OutputPoint;
import org.tron.protos.Contract.OutputPointInfo;
import org.tron.protos.Protocol.Block;
import org.tron.protos.Protocol.ChainParameters;
import org.tron.protos.Protocol.ChainParameters.ChainParameter;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.Protocol.TransactionInfo;
import org.tron.walletserver.GrpcClient;

/**
 * 通过RPC接口创建交易，上链，不停的执行；
 * 一个块最多打包一个匿名交易，理论上单线程就可以了，支持多线程
 */
public class ShieldPressTest {
  private static final Logger logger = LoggerFactory.getLogger("ShieldPressTest");
  //设置为账户中金额的最大值即可
  private final long AMOUNT = 100000000L;

  private static byte[] PRIVATE_KEY;
  private GrpcClient rpcCli;
  private String fullNodeUrl;
  private int workThread = 8;
  private final static String OVK = "030c8c2bc59fb3eb8afb047a8ea4b028743d23e7d38c6fa30908358431e2314d";
  private static AtomicLong shieldTransactionCount = new AtomicLong(0);

  //以固定线程数启动
  private ExecutorService fixedThreadPool;

  private boolean initParameters() {
    Config config = Configuration.getByFileName(null,"config_test.conf");

    String fullNode = "";
    if (config.hasPath("fullnode.ip.list")) {
      fullNode = config.getStringList("fullnode.ip.list").get(0);
    } else {
      System.out.println("Please config fullnode.ip.list");
      return false;
    }
    String solidityNode = "";
    if (config.hasPath("soliditynode.ip.list")) {
      solidityNode = config.getStringList("soliditynode.ip.list").get(0);
    }
    System.out.println("fullNode " + fullNode);
    System.out.println("solidityNode " + solidityNode);
    rpcCli = new GrpcClient(fullNode, solidityNode);

    if (config.hasPath("fullhttp")) {
      fullNodeUrl = "http://" + config.getString("fullhttp")+"/wallet/";
    } else {
      System.out.println("Please config fullhttp");
      return false;
    }
    if (config.hasPath("priKey")) {
      PRIVATE_KEY = ByteArray.fromHexString(config.getString("priKey"));
    } else {
      System.out.println("Please config priKey");
      return false;
    }
    System.out.println("fullhttp " + fullNodeUrl);
    System.out.println("priKey " + ByteArray.toHexString(PRIVATE_KEY));

    if (config.hasPath("workthread")) {
      workThread = config.getInt("workthread");
    }
    System.out.println("workThread " + workThread);
    fixedThreadPool = Executors.newFixedThreadPool(workThread);
    return true;
  }

  public static Optional<ShieldAddressInfo> getNewShieldedAddress() {
    ShieldAddressInfo addressInfo = new ShieldAddressInfo();
    try {
      DiversifierT diversifier = new DiversifierT().random();
      SpendingKey spendingKey = SpendingKey.random();

      FullViewingKey fullViewingKey = spendingKey.fullViewingKey();
      IncomingViewingKey incomingViewingKey = fullViewingKey.inViewingKey();
      PaymentAddress paymentAddress = incomingViewingKey.address(diversifier).get();

      addressInfo.setSk(spendingKey.getValue());
      addressInfo.setD(diversifier);
      addressInfo.setIvk(incomingViewingKey.getValue());
      addressInfo.setOvk(fullViewingKey.getOvk());
      addressInfo.setPkD(paymentAddress.getPkD());

      if (addressInfo.validateCheck()) {
        return Optional.of(addressInfo);
      }
    } catch (Exception e) {
      e.printStackTrace();
    }

    return Optional.empty();
  }

  private boolean checkTransactionOnline(final String trxId, final String ivk) {
    while (true) {
      //如果可以扫描到交易，则继续
      if (scanBlockByIvk(trxId, ivk)) {
//      if (getTransactionInfoById(trxId)) {
        return true;
      }
      try {
        Thread.sleep(500);
      } catch (Exception e) {
        break;
      }
    }
    return false;
  }


  public long getShieldFee() {
    Optional<ChainParameters> chainParameters = rpcCli.getChainParameters();
    if (chainParameters.isPresent()) {
      for (ChainParameter para : chainParameters.get().getChainParameterList()) {
        if (para.getKey().equals("getShieldedTransactionFee")) {
          return para.getValue();
        }
      }
    }
    return 10000000L;
  }

  private boolean scanBlockByIvk(final String hash, final String ivk ) {
    Block block = rpcCli.getBlock(-1);
    if (block != null) {
      long blockNum = block.getBlockHeader().toBuilder().getRawData().getNumber();
      {
        long start = ((blockNum - 1000) >= 0) ? (blockNum - 1000) : 0;
        long end = blockNum;

        IvkDecryptParameters.Builder builder = IvkDecryptParameters.newBuilder();
        builder.setStartBlockIndex(start);
        builder.setEndBlockIndex(end);
        builder.setIvk(ByteString.copyFrom(ByteArray.fromHexString(ivk)));
        DecryptNotes notes = rpcCli.scanNoteByIvk(builder.build());
        if (notes != null) {
          for (int i = 0; i < notes.getNoteTxsList().size(); ++i) {
            DecryptNotes.NoteTx noteTx = notes.getNoteTxsList().get(i);
            if (hash.equals(ByteArray.toHexString(noteTx.getTxid().toByteArray()))) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }


  private boolean getTransactionInfoById(final String hash) {
    Optional<TransactionInfo> transactionInfo = rpcCli.getTransactionInfoById(hash);
    if (transactionInfo.isPresent() && transactionInfo.get().getBlockNumber() != 0L) {
      System.out.println("TrxId " + hash + " is in block " + transactionInfo.get().getBlockNumber());
      return true;
    }
    return false;
  }

  public SpendNote getUnspendNote(final ShieldAddressInfo shieldAddress ) {
    try {
      Block block = rpcCli.getBlock(-1);
      if (block == null) {
        System.out.println("getBlock error");
      }

      long blockNum = block.getBlockHeader().toBuilder().getRawData().getNumber();
      long start = ((blockNum - 1000) >= 0) ? (blockNum - 1000) : 0;
      long end = blockNum;

      IvkDecryptAndMarkParameters.Builder builder = IvkDecryptAndMarkParameters.newBuilder();
      builder.setStartBlockIndex(start);
      builder.setEndBlockIndex(end);
      builder.setIvk(ByteString.copyFrom(shieldAddress.getIvk()));
      builder.setAk(ByteString.copyFrom(shieldAddress.getFullViewingKey().getAk()));
      builder.setNk(ByteString.copyFrom(shieldAddress.getFullViewingKey().getNk()));

      DecryptNotesMarked decryptNotes = rpcCli.scanAndMarkNoteByIvk(builder.build());
      if (decryptNotes.getNoteTxsCount() > 0) {
        for (NoteTx noteTx : decryptNotes.getNoteTxsList()) {
          //没有被花掉，且序号等于目标序号
          if (!noteTx.getIsSpend()) {
            //获取默克尔树相关信息
            OutputPointInfo.Builder request = OutputPointInfo.newBuilder();
            OutputPoint.Builder outPointBuild = OutputPoint.newBuilder();
            outPointBuild.setHash(ByteString.copyFrom(noteTx.getTxid().toByteArray()));
            outPointBuild.setIndex(noteTx.getIndex());
            request.addOutPoints(outPointBuild.build());

            IncrementalMerkleVoucherInfo merkleVoucherInfo = rpcCli
                .GetMerkleTreeVoucherInfo(request.build());
            if (merkleVoucherInfo == null) {
              System.out.println("Can't get all merkel tree, please check the notes.");
              break;
            }

            Note.Builder noteBuild = Note.newBuilder();
            noteBuild.setPaymentAddress(noteTx.getNote().getPaymentAddress());
            noteBuild.setValue(noteTx.getNote().getValue());
            noteBuild.setRcm(noteTx.getNote().getRcm());
            noteBuild.setMemo(noteTx.getNote().getMemo());

            SpendNote.Builder spendNoteBuilder = SpendNote.newBuilder();
            spendNoteBuilder.setNote(noteBuild.build());
            spendNoteBuilder.setAlpha(rpcCli.getRcm().getValue());
            spendNoteBuilder.setVoucher(merkleVoucherInfo.getVouchers(0));
            spendNoteBuilder.setPath(merkleVoucherInfo.getPaths(0));

            return spendNoteBuilder.build();
          }
        }
      }
    } catch (Exception e) {
      e.printStackTrace();
    }
    return SpendNote.getDefaultInstance();
  }

  /**
   * 创建公开地址转匿名地址的交易，并上链
   * @param shieldAddress  目标匿名地址信息
   * @return 上链的交易ID
   */
  private String generatePublicToShieldOnlineTransaction(final ShieldAddressInfo shieldAddress ) {
    try {
      final ECKey ecKey = ECKey.fromPrivate(PRIVATE_KEY);
      byte[] fromAddress = ecKey.getAddress();
      long fee = getShieldFee();

      PrivateParameters.Builder builder = PrivateParameters.newBuilder();
      builder.setTransparentFromAddress(ByteString.copyFrom(fromAddress));
      builder.setFromAmount(AMOUNT);

      byte[] ovk = ByteArray.fromHexString(OVK);
      builder.setOvk(ByteString.copyFrom(ovk));

      {
        Note.Builder noteBuild = Note.newBuilder();
        noteBuild.setPaymentAddress(shieldAddress.getAddress());
        noteBuild.setValue(AMOUNT-fee);
        noteBuild.setRcm(ByteString.copyFrom(rpcCli.getRcm().getValue().toByteArray()));
        noteBuild.setMemo(ByteString.copyFrom("test".getBytes()));
        builder.addShieldedReceives(ReceiveNote.newBuilder().setNote(noteBuild.build()).build());
      }

      TransactionExtention transactionExtention = rpcCli.createShieldTransaction(builder.build());
      Transaction transaction = transactionExtention.getTransaction();

      Any any = transaction.getRawData().getContract(0).getParameter();
      Contract.ShieldedTransferContract shieldedTransferContract =
          any.unpack(Contract.ShieldedTransferContract.class);
      if (shieldedTransferContract.getFromAmount() > 0) {
        transaction = TransactionUtils.sign(transaction, ecKey);
      }

      logger.info("TrxId {} fromAddress {} toAddress {}",
          ByteArray.toHexString(transactionExtention.getTxid().toByteArray()),
          ByteArray.toHexString(fromAddress),
          shieldAddress.getAddress());

      rpcCli.broadcastTransaction(transaction);
      return ByteArray.toHexString(transactionExtention.getTxid().toByteArray());
    } catch (Exception e) {
      e.printStackTrace();
    }
    return "";
  }

  /**
   * 创建匿名到匿名的交易
   * @param fromShieldAddress  源匿名地址
   * @param toShieldAddress   目标匿名地址
   * @return 交易的ID
   */
  private String generatShieldToShieldOnlineTransaction(final ShieldAddressInfo fromShieldAddress,
      final ShieldAddressInfo toShieldAddress) {

    long fee = getShieldFee();
    long shieldFromAmount = 0L;
    try {
      PrivateParameters.Builder builder = PrivateParameters.newBuilder();

      SpendingKey spendingKey = new SpendingKey(fromShieldAddress.getSk());
      ExpandedSpendingKey expandedSpendingKey = spendingKey.expandedSpendingKey();
      builder.setAsk(ByteString.copyFrom(expandedSpendingKey.getAsk()));
      builder.setNsk(ByteString.copyFrom(expandedSpendingKey.getNsk()));
      builder.setOvk(ByteString.copyFrom(expandedSpendingKey.getOvk()));

      //扫描获取未花费的note
      Block block = rpcCli.getBlock(-1);
      if (block == null) {
        System.out.println("getBlock error");
        return "";
      }
      long blockNum = block.getBlockHeader().toBuilder().getRawData().getNumber();
      long start = ((blockNum - 1000) >= 0) ? (blockNum - 1000) : 0;
      IvkDecryptAndMarkParameters.Builder ivkBuilder = IvkDecryptAndMarkParameters.newBuilder();
      ivkBuilder.setStartBlockIndex(start);
      ivkBuilder.setEndBlockIndex(blockNum);
      ivkBuilder.setIvk(ByteString.copyFrom(fromShieldAddress.getIvk()));
      ivkBuilder.setAk(ByteString.copyFrom(fromShieldAddress.getFullViewingKey().getAk()));
      ivkBuilder.setNk(ByteString.copyFrom(fromShieldAddress.getFullViewingKey().getNk()));

      DecryptNotesMarked decryptNotes = rpcCli.scanAndMarkNoteByIvk(ivkBuilder.build());
      if (decryptNotes.getNoteTxsCount() > 0) {
        NoteTx noteTx = decryptNotes.getNoteTxs(0);
        //没有被花掉，且序号等于目标序号
        if (!noteTx.getIsSpend()) {
          //获取默克尔树相关信息
          OutputPointInfo.Builder request = OutputPointInfo.newBuilder();
          OutputPoint.Builder outPointBuild = OutputPoint.newBuilder();
          outPointBuild.setHash(ByteString.copyFrom(noteTx.getTxid().toByteArray()));
          outPointBuild.setIndex(noteTx.getIndex());
          request.addOutPoints(outPointBuild.build());

          shieldFromAmount = noteTx.getNote().getValue();
          if (shieldFromAmount < fee ) {
            System.out.println("The value " + shieldFromAmount+ " can't afford the fee " + fee );
            return "";
          }

          IncrementalMerkleVoucherInfo merkleVoucherInfo = rpcCli
              .GetMerkleTreeVoucherInfo(request.build());
          if (merkleVoucherInfo == null) {
            System.out.println("Can't get all merkel tree, please check the notes.");
            return "";
          }

          Note.Builder noteBuild = Note.newBuilder();
          noteBuild.setPaymentAddress(noteTx.getNote().getPaymentAddress());

          noteBuild.setValue(noteTx.getNote().getValue());
          noteBuild.setRcm(noteTx.getNote().getRcm());
          noteBuild.setMemo(noteTx.getNote().getMemo());

          SpendNote.Builder spendNoteBuilder = SpendNote.newBuilder();
          spendNoteBuilder.setNote(noteBuild.build());
          spendNoteBuilder.setAlpha(rpcCli.getRcm().getValue());
          spendNoteBuilder.setVoucher(merkleVoucherInfo.getVouchers(0));
          spendNoteBuilder.setPath(merkleVoucherInfo.getPaths(0));

          builder.addShieldedSpends(spendNoteBuilder.build());
        } else {
          System.out.println("Can't find unspend note. something is wrong!");
          return "";
        }
      } else {
        System.out.println("Can't find unspend note. something is wrong! 2");
        return "";
      }

      {
        Note.Builder noteBuild = Note.newBuilder();
        noteBuild.setPaymentAddress(toShieldAddress.getAddress());
        noteBuild.setValue(shieldFromAmount-fee);
        noteBuild.setRcm(ByteString.copyFrom(rpcCli.getRcm().getValue().toByteArray()));
        noteBuild.setMemo(ByteString.copyFrom("press test".getBytes()));
        builder.addShieldedReceives(ReceiveNote.newBuilder().setNote(noteBuild.build()).build());
      }

      TransactionExtention transactionExtention = rpcCli.createShieldTransaction(builder.build());

      logger.info("TrxId {} fromAddress {} toAddress {}",
          ByteArray.toHexString(transactionExtention.getTxid().toByteArray()),
          fromShieldAddress.getAddress(),
          toShieldAddress.getAddress());

      rpcCli.broadcastTransaction(transactionExtention.getTransaction());
      return ByteArray.toHexString(transactionExtention.getTxid().toByteArray());
    } catch (Exception e) {
      e.printStackTrace();
    }
    return "";
  }

  boolean init() {
    if (!initParameters()) {
      System.out.println("Init parameters failure.");
      return false;
    }
    return true;
  }

  void rpcPress() {
    System.out.println("Rpc Thread " + Thread.currentThread().getName() + " start to work");
    Random random = new Random();

    while (true) {
      //公开转匿名
      ShieldAddressInfo fromShieldAddress = getNewShieldedAddress().get();
      String hash = generatePublicToShieldOnlineTransaction(fromShieldAddress);

      while (true) {
        //如果可以扫描到交易，则继续
        if (!checkTransactionOnline(hash, ByteArray.toHexString(fromShieldAddress.getIvk()))) {
          System.out.println("Can't find transaction hash " + hash + " on line.");
          break;
        }
        shieldTransactionCount.incrementAndGet();
//        System.out.println("transaction hash is " + hash + " online.");
        ShieldAddressInfo toShieldAddress = getNewShieldedAddress().get();
        hash = generatShieldToShieldOnlineTransaction(fromShieldAddress, toShieldAddress);
        if (StringUtil.isNullOrEmpty(hash)) {
          break;
        }

        fromShieldAddress = toShieldAddress;
      }
    }
  }


  void startWork() {
    for (int i = 0; i < workThread; i++) {
      fixedThreadPool.execute(new Runnable() {
        @Override
        public void run() {
          rpcPress();
        }
      });
    }

  }

  public static void main(String[] args) {

    ShieldPressTest test = new ShieldPressTest();
    if (!test.init()) {
      System.out.println("init failure");
      return;
    }
    test.startWork();

    while (true) {
      System.out.println("-->  " + new DateTime(System.currentTimeMillis())
          + " Transaction num: " + shieldTransactionCount.get() );
      try {
        Thread.sleep(30000);
      } catch (Exception e) {
      }
    }
  }
}
