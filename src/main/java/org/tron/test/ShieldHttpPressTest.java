package org.tron.test;

import com.alibaba.fastjson.JSONObject;
import com.google.protobuf.Any;
import com.google.protobuf.ByteString;
import com.typesafe.config.Config;
import io.netty.util.internal.StringUtil;
import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.nio.charset.Charset;
import java.util.Optional;
import java.util.Random;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import org.apache.http.HttpResponse;
import org.apache.http.client.ClientProtocolException;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;
import org.joda.time.DateTime;
import org.tron.api.GrpcAPI.DecryptNotes;
import org.tron.api.GrpcAPI.DecryptNotesMarked;
import org.tron.api.GrpcAPI.DecryptNotesMarked.NoteTx;
import org.tron.api.GrpcAPI.IvkDecryptAndMarkParameters;
import org.tron.api.GrpcAPI.IvkDecryptParameters;
import org.tron.api.GrpcAPI.Note;
import org.tron.api.GrpcAPI.PrivateParameters;
import org.tron.api.GrpcAPI.PrivateParametersWithoutAsk;
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
import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.GrpcClient;

public class ShieldHttpPressTest {

  private final long AMOUNT = 100000000L;

  private static byte[] PRIVATE_KEY;
  private ShieldAddressInfo shieldAddressInfo;
  private GrpcClient rpcCli;
  private String fullNodeUrl;
  private int workThread = 8;

  private PrivateParameters publicToShield;
  private PrivateParametersWithoutAsk shieldToShield;
  private PrivateParameters shieldToPublic;
  private JSONObject publicToShieldString;
  private JSONObject shieldToShieldString;
  private JSONObject shieldToPublicString;

  private static AtomicLong successRpcCounter = new AtomicLong(0);
  private static AtomicLong failureRpcCounter = new AtomicLong(0);
  private static AtomicLong successHttpCounter = new AtomicLong(0);
  private static AtomicLong failureHttpCounter = new AtomicLong(0);

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

    Optional<ShieldAddressInfo> shieldAddress = getNewShieldedAddress();
    if (shieldAddress.isPresent()) {
      shieldAddressInfo = shieldAddress.get();
    } else {
      System.out.println("Generate shieldAddress failure.");
      return false;
    }
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


  /**
   * 发送 post请求访问本地应用并根据传递参数不同返回不同结果
   */
  public static boolean post(final String url, final JSONObject requestBody) {
    boolean bRet = false;
    // 创建默认的httpClient实例.
    CloseableHttpClient httpclient = HttpClients.createDefault();
    // 创建httppost
    HttpPost httppost = new HttpPost(url);
    httppost.setHeader("Content-type", "application/json; charset=utf-8");
    httppost.setHeader("Connection", "Close");
    // 创建参数队列
    if (requestBody != null) {
      StringEntity entity = new StringEntity(requestBody.toString(), Charset.forName("UTF-8"));
      entity.setContentEncoding("UTF-8");
      entity.setContentType("application/json");
      httppost.setEntity(entity);
    }

    try {
      CloseableHttpResponse response = httpclient.execute(httppost);
      try {
        bRet = verificationResult(response);
      } finally {
        response.close();
      }
    } catch (ClientProtocolException e) {
      e.printStackTrace();
    } catch (UnsupportedEncodingException e1) {
      e1.printStackTrace();
    } catch (IOException e) {
      e.printStackTrace();
    } finally {
      // 关闭连接,释放资源
      try {
        httpclient.close();
      } catch (IOException e) {
        e.printStackTrace();
      }
    }
    return bRet;
  }

  public static JSONObject parseResponseContent(HttpResponse response) {
    try {
      String result = EntityUtils.toString(response.getEntity());
      StringEntity entity = new StringEntity(result, Charset.forName("UTF-8"));
//      System.out.print("Response content: " + EntityUtils.toString(entity, "UTF-8"));
      response.setEntity(entity);
      JSONObject obj = JSONObject.parseObject(result);
      return obj;
    } catch (Exception e) {
      e.printStackTrace();
      return null;
    }
  }

  /**
   * constructor.
   */
  public static Boolean verificationResult(HttpResponse response) {
    if (response.getStatusLine().getStatusCode() != 200) {
      return false;
    }

    JSONObject responseContent = parseResponseContent(response);
    if (responseContent.containsKey("raw_data") &&
        !StringUtil.isNullOrEmpty(responseContent.getString("raw_data"))) {
      return true;
    }
    return false;
  }


  public String generateShiledCm() {
    try {
      final ECKey ecKey = ECKey.fromPrivate(PRIVATE_KEY);
      byte[] fromAddress = ecKey.getAddress();
      long fee = getShieldFee();

      PrivateParameters.Builder builder = PrivateParameters.newBuilder();
      builder.setTransparentFromAddress(ByteString.copyFrom(fromAddress));
      builder.setFromAmount(2 * AMOUNT + fee);

      byte[] ovk = ByteArray
          .fromHexString("030c8c2bc59fb3eb8afb047a8ea4b028743d23e7d38c6fa30908358431e2314d");
      builder.setOvk(ByteString.copyFrom(ovk));

      for (int i = 0; i < 2; ++i) {
        Note.Builder noteBuild = Note.newBuilder();
        noteBuild.setPaymentAddress(shieldAddressInfo.getAddress());
        noteBuild.setValue(AMOUNT);
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

      rpcCli.broadcastTransaction(transaction);

      return ByteArray.toHexString(transactionExtention.getTxid().toByteArray());
    } catch (Exception e) {
      e.printStackTrace();
    }
    return "";
  }

  public long getShieldFee() {
    return 10000000L;
  }

  private boolean scanBlockByIvk(final String hash) {
    Block block = rpcCli.getBlock(-1);
    if (block != null) {
      long blockNum = block.getBlockHeader().toBuilder().getRawData().getNumber();
      {
        long start = 0;
        long end = start;
        while (end < blockNum) {
          if (blockNum - start > 1000) {
            end = start + 1000;
          } else {
            end = blockNum;
          }

          IvkDecryptParameters.Builder builder = IvkDecryptParameters.newBuilder();
          builder.setStartBlockIndex(start);
          builder.setEndBlockIndex(end);
          builder.setIvk(ByteString.copyFrom(shieldAddressInfo.getIvk()));
          DecryptNotes notes = rpcCli.scanNoteByIvk(builder.build());
          if (notes != null) {
            for (int i = 0; i < notes.getNoteTxsList().size(); ++i) {
              DecryptNotes.NoteTx noteTx = notes.getNoteTxsList().get(i);
              if (hash.equals(ByteArray.toHexString(noteTx.getTxid().toByteArray()))) {
                return true;
              }
            }
          }
          start = end;
        }
      }
    }
    return false;
  }

  public SpendNote getIndexNote(int index) {
    try {
      Block block = rpcCli.getBlock(-1);
      if (block == null) {
        System.out.println("getBlock error");
      }

      long blockNum = block.getBlockHeader().toBuilder().getRawData().getNumber();
      long start = 0;
      long end = start;
      while (end < blockNum) {
        if (blockNum - start > 1000) {
          end = start + 1000;
        } else {
          end = blockNum;
        }

        IvkDecryptAndMarkParameters.Builder builder = IvkDecryptAndMarkParameters.newBuilder();
        builder.setStartBlockIndex(start);
        builder.setEndBlockIndex(end);
        builder.setIvk(ByteString.copyFrom(shieldAddressInfo.getIvk()));
        builder.setAk(ByteString.copyFrom(shieldAddressInfo.getFullViewingKey().getAk()));
        builder.setNk(ByteString.copyFrom(shieldAddressInfo.getFullViewingKey().getNk()));

        DecryptNotesMarked decryptNotes = rpcCli.scanAndMarkNoteByIvk(builder.build());
        if (decryptNotes.getNoteTxsCount() > 0) {
          for (NoteTx noteTx : decryptNotes.getNoteTxsList()) {
            //没有被花掉，且序号等于目标序号
            if (!noteTx.getIsSpend() && noteTx.getIndex() == index) {
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
        start = end;
      }
    } catch (Exception e) {
      e.printStackTrace();
    }
    return SpendNote.getDefaultInstance();
  }

  public PrivateParameters createPublicToShieldTransaction() {
    try {
      final ECKey ecKey = ECKey.fromPrivate(PRIVATE_KEY);
      byte[] fromAddress = ecKey.getAddress();
      long fee = getShieldFee();
      ShieldAddressInfo addressInfo = getNewShieldedAddress().get();

      PrivateParameters.Builder builder = PrivateParameters.newBuilder();
      builder.setTransparentFromAddress(ByteString.copyFrom(fromAddress));
      builder.setFromAmount(2 * AMOUNT + fee);

      byte[] ovk = ByteArray
          .fromHexString("030c8c2bc59fb3eb8afb047a8ea4b028743d23e7d38c6fa30908358431e2314d");
      builder.setOvk(ByteString.copyFrom(ovk));

      for (int i = 0; i < 2; ++i) {
        Note.Builder noteBuild = Note.newBuilder();
        noteBuild.setPaymentAddress(addressInfo.getAddress());
        noteBuild.setValue(AMOUNT);
        noteBuild.setRcm(ByteString.copyFrom(rpcCli.getRcm().getValue().toByteArray()));
        noteBuild.setMemo(ByteString.copyFrom("press test".getBytes()));

        builder.addShieldedReceives(ReceiveNote.newBuilder().setNote(noteBuild.build()).build());
      }
      return builder.build();
    } catch (Exception e) {
      e.printStackTrace();
    }
    return PrivateParameters.getDefaultInstance();
  }

  public PrivateParametersWithoutAsk createShieldToShieldTransaction() {
    try {
      long fee = getShieldFee();

      PrivateParametersWithoutAsk.Builder builder = PrivateParametersWithoutAsk.newBuilder();

      SpendingKey spendingKey = new SpendingKey(shieldAddressInfo.getSk());
      ExpandedSpendingKey expandedSpendingKey = spendingKey.expandedSpendingKey();
      builder.setAk(ByteString.copyFrom(shieldAddressInfo.getFullViewingKey().getAk()));
      builder.setNsk(ByteString.copyFrom(expandedSpendingKey.getNsk()));
      builder.setOvk(ByteString.copyFrom(expandedSpendingKey.getOvk()));

      //index 0
      builder.addShieldedSpends(getIndexNote(0));

      for (int i = 0; i < 2; ++i) {
        ShieldAddressInfo addressInfo = getNewShieldedAddress().get();
        Note.Builder noteBuild = Note.newBuilder();
        noteBuild.setPaymentAddress(addressInfo.getAddress());
        noteBuild.setValue((AMOUNT - fee) / 2);
        noteBuild.setRcm(ByteString.copyFrom(rpcCli.getRcm().getValue().toByteArray()));
        noteBuild.setMemo(ByteString.copyFrom("press test".getBytes()));

        builder.addShieldedReceives(ReceiveNote.newBuilder().setNote(noteBuild.build()).build());
      }

      return builder.build();
    } catch (Exception e) {
      e.printStackTrace();
    }
    return PrivateParametersWithoutAsk.getDefaultInstance();
  }

  public PrivateParameters createShieldToPublicTransaction() {
    try {
      final ECKey ecKey = ECKey.fromPrivate(PRIVATE_KEY);
      byte[] fromAddress = ecKey.getAddress();
      long fee = getShieldFee();

      PrivateParameters.Builder builder = PrivateParameters.newBuilder();

      SpendingKey spendingKey = new SpendingKey(shieldAddressInfo.getSk());
      ExpandedSpendingKey expandedSpendingKey = spendingKey.expandedSpendingKey();
      builder.setAsk(ByteString.copyFrom(expandedSpendingKey.getAsk()));
      builder.setNsk(ByteString.copyFrom(expandedSpendingKey.getNsk()));
      builder.setOvk(ByteString.copyFrom(expandedSpendingKey.getOvk()));

      //index 1
      builder.addShieldedSpends(getIndexNote(1));

      builder.setTransparentToAddress(ByteString.copyFrom(fromAddress));
      builder.setToAmount(AMOUNT - fee);

      return builder.build();
    } catch (Exception e) {
      e.printStackTrace();
    }
    return PrivateParameters.getDefaultInstance();
  }

  boolean init() {
    if (!initParameters()) {
      System.out.println("Init parameters failure.");
      return false;
    }

    String hash = generateShiledCm();
    if (StringUtil.isNullOrEmpty(hash)) {
      System.out.println("Generate cm to prepare failure.");
      return false;
    }

    while (true) {
      //如果可以扫描到交易，则继续
      if (scanBlockByIvk(hash)) {
        break;
      }
      try {
        Thread.sleep(1000);
      } catch (Exception e) {
      }
    }

    TransactionExtention transactionExtention;
    publicToShield = createPublicToShieldTransaction();
    transactionExtention = rpcCli
        .createShieldTransaction(publicToShield);
    if (!transactionExtention.getResult().getResult()) {
      System.out.println("createShieldTransaction 1 failure");
      return false;
    }

    publicToShieldString = JSONObject.parseObject(JsonFormat.printToString(publicToShield,
        false));
    System.out.println(publicToShieldString.toJSONString());

    shieldToShield = createShieldToShieldTransaction();
    transactionExtention = rpcCli
        .createShieldTransactionWithoutSpendAuthSig(shieldToShield);
    if (!transactionExtention.getResult().getResult()) {
      System.out.println("createShieldTransactionWithoutSpendAuthSig failure");
      return false;
    }
    shieldToShieldString = JSONObject.parseObject(JsonFormat.printToString(shieldToShield,
        false));
    System.out.println(shieldToShieldString.toJSONString());

    shieldToPublic = createShieldToPublicTransaction();
    transactionExtention = rpcCli.createShieldTransaction(shieldToPublic);
    if (!transactionExtention.getResult().getResult()) {
      System.out.println("createShieldTransaction 2 failure");
      return false;
    }
    shieldToPublicString = JSONObject.parseObject(JsonFormat.printToString(shieldToPublic,
        false));
    System.out.println(shieldToPublicString.toJSONString());

    return true;
  }

  void rpcPress() {
    System.out.println("Rpc Thread " + Thread.currentThread().getName() + " start to work");
    Random random = new Random();

    TransactionExtention transactionExtention;
    while (true) {
      try {
        int s = random.nextInt(3);
        switch (s) {
          case 0: {
            transactionExtention = rpcCli.createShieldTransaction(publicToShield);
            break;
          }
          case 1: {
            transactionExtention = rpcCli
                .createShieldTransactionWithoutSpendAuthSig(shieldToShield);
            break;
          }
          default: {
            transactionExtention = rpcCli.createShieldTransaction(shieldToPublic);
            break;
          }
        }
//        System.out.println("Rpc " + ByteArray.toHexString(transactionExtention.getTxid().toByteArray()));
        if (transactionExtention.getResult().getResult()) {
          successRpcCounter.incrementAndGet();
        } else {
          failureRpcCounter.incrementAndGet();
        }
      } catch (Exception e) {
        failureRpcCounter.incrementAndGet();
        String errString;
        if (e.getMessage() != null) {
          errString = e.getMessage();
        } else {
          errString = "null";
        }
        System.out.println(errString);
      }
    }
  }

  void httpPress() {
    System.out.println("Http Thread " + Thread.currentThread().getName() + " start to work");
    Random random = new Random();

    boolean response;
    while (true) {
      try {
        int s = random.nextInt(3);
        switch (s) {
          case 0: {
            response = post(fullNodeUrl + "createshieldedtransaction", publicToShieldString);
            break;
          }
          case 1: {
            response = post(fullNodeUrl + "createshieldedtransactionwithoutspendauthsig",
                shieldToShieldString);
            break;
          }
          default: {
            response = post(fullNodeUrl + "createshieldedtransaction", shieldToPublicString);
            break;
          }
        }
        if (response) {
          successHttpCounter.incrementAndGet();
        } else {
          failureHttpCounter.incrementAndGet();
        }
      } catch (Exception e) {
        failureHttpCounter.incrementAndGet();
        String errString;
        if (e.getMessage() != null) {
          errString = e.getMessage();
        } else {
          errString = "null";
        }
        System.out.println(errString);
      }
    }
  }

  void startWork() {
    //star rpc thread
    for (int i = 0; i < workThread/2; i++) {
      fixedThreadPool.execute(new Runnable() {
        @Override
        public void run() {
          rpcPress();
        }
      });
    }

    //start http thread
    for (int i = 0; i < workThread/2; i++) {
      fixedThreadPool.execute(new Runnable() {

        @Override
        public void run() {
          httpPress();
        }
      });
    }

  }

  public static void main(String[] args) {

    ShieldHttpPressTest test = new ShieldHttpPressTest();
    if (!test.init()) {
      System.out.println("init failure");
      return;
    }
    test.startWork();

    long startTime = System.currentTimeMillis();
    while (true) {
      long endTime = System.currentTimeMillis() + 1;
      long successRpc = successRpcCounter.get();
      long failureRpc = failureRpcCounter.get();
      double resultRcp = ((successRpc + failureRpc) * 1000 * 60) / (endTime - startTime);

      long successHttp = successHttpCounter.get();
      long failureHttp = failureHttpCounter.get();
      double resultHttp = ((successHttp + failureHttp) * 1000 * 60) / (endTime - startTime);
      System.out.println("----> " + new DateTime(endTime) + " <----");
      System.out.println(
          "RPC Test success:" + successRpc + " faiure:" + failureRpc + " result:" + resultRcp);
      System.out.println(
          "Http Test success:" + successHttp + " faiure:" + failureHttp + " result:" + resultHttp);

      try {
        Thread.sleep(30000);
      } catch (Exception e) {
      }
    }
  }

}
