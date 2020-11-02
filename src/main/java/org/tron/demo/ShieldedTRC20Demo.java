package org.tron.demo;

import com.google.protobuf.ByteString;
import java.math.BigInteger;
import java.util.List;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.junit.Assert;
import org.spongycastle.util.encoders.Hex;
import org.tron.api.GrpcAPI;
import org.tron.api.GrpcAPI.Return;
import org.tron.api.GrpcAPI.TransactionExtention;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.Sha256Sm3Hash;
import org.tron.common.utils.AbiUtil;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.ByteUtil;
import org.tron.common.utils.Hash;
import org.tron.common.utils.TransactionUtils;
import org.tron.core.config.Parameter.CommonConstant;
import org.tron.core.exception.ZksnarkException;
import org.tron.core.zen.address.DiversifierT;
import org.tron.core.zen.address.ExpandedSpendingKey;
import org.tron.core.zen.address.FullViewingKey;
import org.tron.core.zen.address.IncomingViewingKey;
import org.tron.core.zen.address.KeyIo;
import org.tron.core.zen.address.PaymentAddress;
import org.tron.core.zen.address.SpendingKey;
import org.tron.protos.Protocol;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.Protocol.Transaction.Result;
import org.tron.protos.Protocol.TransactionInfo;
import org.tron.protos.contract.SmartContractOuterClass;
import org.tron.protos.contract.SmartContractOuterClass.TriggerSmartContract;
import org.tron.walletserver.GrpcClient;
import org.tron.walletserver.WalletApi;

@Slf4j
public class ShieldedTRC20Demo {

  private static String fullnode = "34.220.77.106:50051";
  private static String soliditynode = "52.15.93.92:50061";
  private static String trc20ContractAddress = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
  private static String shieldedTRC20ContractAddress = "TQEuSEVRk1GtfExm5q9T8a1w84GvgQJ13V";
  private static String privateKey =
      "f4cc9a4bcd6a2167e734d0e3de349f93c3a0210fcf6c2390f0e20bc43832a13b";
  private static String pubAddress = "TCuT4T3xhrSuScmhbVuWf3ZAvRnMXvoqC6";
  private static String spendingKey = "004f74ce2bde08f0c936f2929b94cb2ca49111db95001576f99d04c3e671daf6";
  private static GrpcClient grpcClient = new GrpcClient(fullnode, soliditynode);
  private static BigInteger scalingFactorBi = getScalingFactorBi();

  public static void main(String[] args) throws ZksnarkException, InterruptedException {

    mintDemo();
    transferDemo();
    burnDemo();
  }

  private static String mintDemo() throws ZksnarkException {

    SpendingKey sk = new SpendingKey(ByteArray.fromHexString(spendingKey));
    ExpandedSpendingKey expsk = sk.expandedSpendingKey();

    byte[] ovk = expsk.getOvk();
    long fromAmount = 10;
    FullViewingKey fullViewingKey = sk.fullViewingKey();
    IncomingViewingKey incomingViewingKey = fullViewingKey.inViewingKey();
    PaymentAddress paymentAddress = incomingViewingKey.address(new DiversifierT().random()).get();

    //set approve
    setAllowance(fromAmount);
    //ReceiveNote
    GrpcAPI.ReceiveNote.Builder revNoteBuilder = GrpcAPI.ReceiveNote.newBuilder();
    long revValue = fromAmount;
    byte[] memo = new byte[512];
    byte[] rcm = grpcClient.getRcm().getValue().toByteArray();
    GrpcAPI.Note revNote = getNote(revValue, KeyIo.encodePaymentAddress(paymentAddress), rcm, memo);
    revNoteBuilder.setNote(revNote);

    byte[] contractAddress = WalletApi.decodeFromBase58Check(shieldedTRC20ContractAddress);
    GrpcAPI.PrivateShieldedTRC20Parameters.Builder paramBuilder = GrpcAPI
        .PrivateShieldedTRC20Parameters.newBuilder();
    paramBuilder.setOvk(ByteString.copyFrom(ovk));
    paramBuilder.setFromAmount(getScaledPublicAmount(fromAmount));
    paramBuilder.addShieldedReceives(revNoteBuilder.build());
    paramBuilder.setShieldedTRC20ContractAddress(ByteString.copyFrom(contractAddress));

    GrpcAPI.ShieldedTRC20Parameters trc20MintParams = grpcClient
        .createShieldedContractParameters(paramBuilder.build());
    byte[] callerAddress = WalletApi.decodeFromBase58Check(pubAddress);
    return triggerMint(contractAddress, callerAddress, privateKey,
        trc20MintParams.getTriggerContractInput());
  }

  public static void transferDemo() throws ZksnarkException, InterruptedException {
    byte[] contractAddress = WalletApi
        .decodeFromBase58Check(shieldedTRC20ContractAddress);
    byte[] callerAddress = WalletApi.decodeFromBase58Check(pubAddress);
    SpendingKey sk = new SpendingKey(ByteArray.fromHexString(spendingKey));
    setAllowance(10);
    GrpcAPI.PrivateShieldedTRC20Parameters mintPrivateParam1 = mintParams(
        privateKey, 10, shieldedTRC20ContractAddress);
    GrpcAPI.ShieldedTRC20Parameters mintParam1 = grpcClient.createShieldedContractParameters(
        mintPrivateParam1);
    String mintInput = mintParam1.getTriggerContractInput();
    String txid = triggerMint(contractAddress, callerAddress, privateKey, mintInput);

    // SpendNoteTRC20 1
    logger.info("mint txid: " + txid);
    Optional<TransactionInfo> infoById = grpcClient.getTransactionInfoById(txid);
    while (infoById.get().getLogList().size() < 2) {
      logger.info("Can not get transaction info, please wait....");
      Thread.sleep(5000);
      infoById = grpcClient.getTransactionInfoById(txid);
    }
    byte[] txData = infoById.get().getLog(1).getData().toByteArray();
    long pos = bytes32Tolong(ByteArray.subArray(txData, 0, 32));
    byte[] contractResult = triggerGetPath(contractAddress, pos);
    byte[] path = ByteArray.subArray(contractResult, 32, 1056);
    byte[] root = ByteArray.subArray(contractResult, 0, 32);
    GrpcAPI.SpendNoteTRC20.Builder note1Builder = GrpcAPI.SpendNoteTRC20.newBuilder();
    note1Builder.setAlpha(ByteString.copyFrom(grpcClient.getRcm().getValue().toByteArray()));
    note1Builder.setPos(pos);
    note1Builder.setPath(ByteString.copyFrom(path));
    note1Builder.setRoot(ByteString.copyFrom(root));
    note1Builder.setNote(mintPrivateParam1.getShieldedReceives(0).getNote());
    GrpcAPI.PrivateShieldedTRC20Parameters.Builder privateTRC20Builder = GrpcAPI
        .PrivateShieldedTRC20Parameters.newBuilder();
    privateTRC20Builder.addShieldedSpends(note1Builder.build());

    //ReceiveNote 1
    GrpcAPI.ReceiveNote.Builder revNoteBuilder = GrpcAPI.ReceiveNote.newBuilder();
    FullViewingKey fullViewingKey = sk.fullViewingKey();
    IncomingViewingKey incomingViewingKey = fullViewingKey.inViewingKey();
    PaymentAddress paymentAddress = incomingViewingKey.address(new DiversifierT().random()).get();
    long revValue = 10;
    byte[] memo = new byte[512];
    byte[] rcm = grpcClient.getRcm().getValue().toByteArray();
    String paymentAddressStr = KeyIo.encodePaymentAddress(paymentAddress);
    GrpcAPI.Note revNote = getNote(revValue, paymentAddressStr, rcm, memo);
    revNoteBuilder.setNote(revNote);
    privateTRC20Builder.addShieldedReceives(revNoteBuilder.build());

    ExpandedSpendingKey expsk = sk.expandedSpendingKey();
    privateTRC20Builder.setAsk(ByteString.copyFrom(expsk.getAsk()));
    privateTRC20Builder.setNsk(ByteString.copyFrom(expsk.getNsk()));
    privateTRC20Builder.setOvk(ByteString.copyFrom(expsk.getOvk()));
    privateTRC20Builder.setShieldedTRC20ContractAddress(ByteString.copyFrom(contractAddress));
    GrpcAPI.ShieldedTRC20Parameters transferParam = grpcClient
        .createShieldedContractParameters(privateTRC20Builder.build());
    triggerTransfer(contractAddress, callerAddress, privateKey,
        transferParam.getTriggerContractInput());
  }

  public static void burnDemo() throws ZksnarkException, InterruptedException {
    byte[] contractAddress = WalletApi
        .decodeFromBase58Check(shieldedTRC20ContractAddress);
    byte[] callerAddress = WalletApi.decodeFromBase58Check(pubAddress);
    SpendingKey sk = new SpendingKey(ByteArray.fromHexString(spendingKey));
    GrpcAPI.PrivateShieldedTRC20Parameters mintPrivateParam1 = mintParams(
        privateKey, 10, shieldedTRC20ContractAddress);
    setAllowance(10);
    GrpcAPI.ShieldedTRC20Parameters mintParam1 = grpcClient.createShieldedContractParameters(
        mintPrivateParam1);
    long value = 10;
    String mintInput1 = mintParam1.getTriggerContractInput();
    String txid = triggerMint(contractAddress, callerAddress, privateKey, mintInput1);

    // SpendNoteTRC20 1
    Optional<TransactionInfo> infoById = grpcClient.getTransactionInfoById(txid);
    while (infoById.get().getLogList().size() < 2) {
      logger.info("Can not get transaction info, please wait....");
      Thread.sleep(5000);
      infoById = grpcClient.getTransactionInfoById(txid);
    }
    byte[] tx1Data = infoById.get().getLog(1).getData().toByteArray();
    long pos = bytes32Tolong(ByteArray.subArray(tx1Data, 0, 32));
    byte[] contractResult = triggerGetPath(contractAddress, pos);
    byte[] path = ByteArray.subArray(contractResult, 32, 1056);
    byte[] root = ByteArray.subArray(contractResult, 0, 32);
    GrpcAPI.SpendNoteTRC20.Builder note1Builder = GrpcAPI.SpendNoteTRC20.newBuilder();
    note1Builder.setAlpha(ByteString.copyFrom(grpcClient.getRcm().getValue().toByteArray()));
    note1Builder.setPos(pos);
    note1Builder.setPath(ByteString.copyFrom(path));
    note1Builder.setRoot(ByteString.copyFrom(root));
    note1Builder.setNote(mintPrivateParam1.getShieldedReceives(0).getNote());
    GrpcAPI.PrivateShieldedTRC20Parameters.Builder privateTRC20Builder = GrpcAPI
        .PrivateShieldedTRC20Parameters.newBuilder();
    privateTRC20Builder.addShieldedSpends(note1Builder.build());

    ExpandedSpendingKey expsk = sk.expandedSpendingKey();
    privateTRC20Builder.setAsk(ByteString.copyFrom(expsk.getAsk()));
    privateTRC20Builder.setNsk(ByteString.copyFrom(expsk.getNsk()));
    privateTRC20Builder.setOvk(ByteString.copyFrom(expsk.getOvk()));
    BigInteger toAmount = BigInteger.valueOf(10).multiply(scalingFactorBi);
    privateTRC20Builder.setToAmount(toAmount.toString());
    privateTRC20Builder.setTransparentToAddress(ByteString.copyFrom(callerAddress));
    privateTRC20Builder.setShieldedTRC20ContractAddress(ByteString.copyFrom(contractAddress));
    GrpcAPI.ShieldedTRC20Parameters burnParam = grpcClient.createShieldedContractParameters(privateTRC20Builder.build());

    triggerBurn(contractAddress, callerAddress, privateKey,
        burnParam.getTriggerContractInput());
  }

  private static GrpcAPI.Note getNote(long value, String paymentAddress, byte[] rcm, byte[] memo) {
    GrpcAPI.Note.Builder noteBuilder = GrpcAPI.Note.newBuilder();
    noteBuilder.setValue(value);
    noteBuilder.setPaymentAddress(paymentAddress);
    noteBuilder.setRcm(ByteString.copyFrom(rcm));
    noteBuilder.setMemo(ByteString.copyFrom(memo));
    return noteBuilder.build();
  }

  private static String triggerMint(byte[] contractAddress,
      byte[] callerAddress, String privateKey, String input) {
    String methodSign = "mint(uint256,bytes32[9],bytes32[2],bytes32[21])";
    byte[] selector = new byte[4];
    System.arraycopy(Hash.sha3(methodSign.getBytes()), 0, selector, 0, 4);
    return triggerContract(contractAddress,
        "mint(uint256,bytes32[9],bytes32[2],bytes32[21])",
        input,
        true,
        0L, 10000000L,
        "0", 0,
        callerAddress, privateKey);
  }

  private static String triggerTransfer(
      byte[] contractAddress,
      byte[] callerAddress, String privateKey, String input) {
    String txid = triggerContract(contractAddress,
        "transfer(bytes32[10][],bytes32[2][],bytes32[9][],bytes32[2],bytes32[21][])",
        input,
        true,
        0L, 1000000000L,
        "0",
        0,
        callerAddress, privateKey);
    Optional<TransactionInfo> infoById = grpcClient.getTransactionInfoById(txid);
    return txid;
  }

  private static String triggerBurn(byte[] contractAddress,
      byte[] callerAddress, String privateKey, String input) {
    return triggerContract(contractAddress,
        "burn(bytes32[10],bytes32[2],uint256,bytes32[2],address,bytes32[3],bytes32[9][],"
            + "bytes32[21][])",
        input,
        true,
        0L, 1000000000L,
        "0",
        0,
        callerAddress, privateKey);
  }


  private static String triggerContract(byte[] contractAddress, String method, String argsStr,
      Boolean isHex, long callValue, long feeLimit, String tokenId, long tokenValue,
      byte[] ownerAddress,
      String priKey) {
    WalletApi.setAddressPreFixByte(CommonConstant.ADD_PRE_FIX_BYTE_MAINNET);
    ECKey temKey = null;
    try {
      BigInteger priK = new BigInteger(priKey, 16);
      temKey = ECKey.fromPrivate(priK);
    } catch (Exception ex) {
      ex.printStackTrace();
    }
    final ECKey ecKey = temKey;
    if (argsStr.equalsIgnoreCase("#")) {
      logger.info("argsstr is #");
      argsStr = "";
    }

    byte[] owner = ownerAddress;
    byte[] input = Hex.decode(AbiUtil.parseMethod(method, argsStr, isHex));
    TriggerSmartContract.Builder builder = TriggerSmartContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setContractAddress(ByteString.copyFrom(contractAddress));
    builder.setData(ByteString.copyFrom(input));
    builder.setCallValue(callValue);
    builder.setTokenId(Long.parseLong(tokenId));
    builder.setCallTokenValue(tokenValue);
    TriggerSmartContract triggerContract = builder.build();

    TransactionExtention transactionExtention = grpcClient.triggerContract(triggerContract);
    if (transactionExtention == null || !transactionExtention.getResult().getResult()) {
      System.out.println("RPC create call trx failed!");
      System.out.println("Code = " + transactionExtention.getResult().getCode());
      System.out
          .println("Message = " + transactionExtention.getResult().getMessage().toStringUtf8());
      return null;
    }
    Transaction transaction = transactionExtention.getTransaction();
    if (transaction.getRetCount() != 0
        && transactionExtention.getConstantResult(0) != null
        && transactionExtention.getResult() != null) {
      byte[] result = transactionExtention.getConstantResult(0).toByteArray();
      System.out.println("message:" + transaction.getRet(0).getRet());
      System.out.println(":" + ByteArray
          .toStr(transactionExtention.getResult().getMessage().toByteArray()));
      System.out.println("Result:" + Hex.toHexString(result));
      return null;
    }

    final TransactionExtention.Builder texBuilder = TransactionExtention.newBuilder();
    Transaction.Builder transBuilder = Transaction.newBuilder();
    Transaction.raw.Builder rawBuilder = transactionExtention.getTransaction().getRawData()
        .toBuilder();
    rawBuilder.setFeeLimit(feeLimit);

    transBuilder.setRawData(rawBuilder);
    for (int i = 0; i < transactionExtention.getTransaction().getSignatureCount(); i++) {
      ByteString s = transactionExtention.getTransaction().getSignature(i);
      transBuilder.setSignature(i, s);
    }
    for (int i = 0; i < transactionExtention.getTransaction().getRetCount(); i++) {
      Result r = transactionExtention.getTransaction().getRet(i);
      transBuilder.setRet(i, r);
    }
    texBuilder.setTransaction(transBuilder);
    texBuilder.setResult(transactionExtention.getResult());
    texBuilder.setTxid(transactionExtention.getTxid());

    transactionExtention = texBuilder.build();
    if (transactionExtention == null) {
      return null;
    }
    Return ret = transactionExtention.getResult();
    if (!ret.getResult()) {
      System.out.println("Code = " + ret.getCode());
      System.out.println("Message = " + ret.getMessage().toStringUtf8());
      return null;
    }
    transaction = transactionExtention.getTransaction();
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      System.out.println("Transaction is empty");
      return null;
    }
    transaction = signTransaction(ecKey, transaction);
    String txid = ByteArray.toHexString(Sha256Sm3Hash.hash(
        transaction.getRawData().toByteArray()));
    System.out.println("trigger txid = " + txid);
    grpcClient.broadcastTransaction(transaction);
    return txid;
  }

  public static Protocol.Transaction signTransaction(ECKey ecKey,
      Protocol.Transaction transaction) {
    WalletApi.setAddressPreFixByte(CommonConstant.ADD_PRE_FIX_BYTE_MAINNET);
    if (ecKey == null || ecKey.getPrivKey() == null) {
      //logger.warn("Warning: Can't sign,there is no private key !!");
      return null;
    }
    transaction = TransactionUtils.setTimestamp(transaction);
    logger.info("Txid in sign is " + ByteArray.toHexString(Sha256Sm3Hash.hash(transaction.getRawData().toByteArray())));
    return TransactionUtils.sign(transaction, ecKey);
  }

  private static BigInteger getScalingFactorBi() {
    byte[] contractAddress = WalletApi
        .decodeFromBase58Check(shieldedTRC20ContractAddress);
    byte[] scalingFactorBytes = triggerGetScalingFactor(contractAddress);
    return ByteUtil.bytesToBigInteger(scalingFactorBytes);
  }

  private static byte[] triggerGetScalingFactor(
      byte[] contractAddress) {
    String methodSign = "scalingFactor()";
    byte[] selector = new byte[4];
    System.arraycopy(Hash.sha3(methodSign.getBytes()), 0, selector, 0, 4);
    SmartContractOuterClass.TriggerSmartContract.Builder triggerBuilder = SmartContractOuterClass
        .TriggerSmartContract.newBuilder();
    triggerBuilder.setContractAddress(ByteString.copyFrom(contractAddress));
    triggerBuilder.setData(ByteString.copyFrom(selector));
    GrpcAPI.TransactionExtention trxExt2 = grpcClient.triggerConstantContract(
        triggerBuilder.build());
    List<ByteString> list = trxExt2.getConstantResultList();
    byte[] result = new byte[0];
    for (ByteString bs : list) {
      result = ByteUtil.merge(result, bs.toByteArray());
    }
    Assert.assertEquals(32, result.length);
    System.out.println(ByteArray.toHexString(result));
    return result;
  }

  private static String getScaledPublicAmount(long amount) {
    BigInteger result = BigInteger.valueOf(amount).multiply(scalingFactorBi);
    return result.toString();
  }


  private static void setAllowance(long amount) {
    byte[] contractAddress = WalletApi
        .decodeFromBase58Check(trc20ContractAddress);
    byte[] shieldedContractAddress = WalletApi
        .decodeFromBase58Check(shieldedTRC20ContractAddress);
    byte[] shieldedContractAddressPadding = new byte[32];
    System.arraycopy(shieldedContractAddress, 0, shieldedContractAddressPadding, 11, 21);
    byte[] valueBytes = longTo32Bytes(amount);
    String input = Hex.toHexString(ByteUtil.merge(shieldedContractAddressPadding, valueBytes));
    byte[] callerAddress = WalletApi.decodeFromBase58Check(pubAddress);
    String txid = triggerContract(contractAddress,
        "approve(address,uint256)",
        input,
        true,
        0L,
        10000000L,
        "0",
        0,
        callerAddress,
        privateKey);
  }

  private static GrpcAPI.PrivateShieldedTRC20Parameters mintParams(String privKey,
      long value, String contractAddr)
      throws ZksnarkException {
    BigInteger fromAmount = BigInteger.valueOf(value).multiply(scalingFactorBi);
    SpendingKey sk = new SpendingKey(ByteArray.fromHexString(spendingKey));
    ExpandedSpendingKey expsk = sk.expandedSpendingKey();
    byte[] ask = expsk.getAsk();
    byte[] nsk = expsk.getNsk();
    byte[] ovk = expsk.getOvk();

    // ReceiveNote
    GrpcAPI.ReceiveNote.Builder revNoteBuilder = GrpcAPI.ReceiveNote.newBuilder();
    // SpendingKey spendingKey = SpendingKey.random();
    FullViewingKey fullViewingKey = sk.fullViewingKey();
    IncomingViewingKey incomingViewingKey = fullViewingKey.inViewingKey();
    PaymentAddress paymentAddress = incomingViewingKey.address(new DiversifierT().random()).get();
    byte[] memo = new byte[512];
    byte[] rcm = grpcClient.getRcm().getValue().toByteArray();
    String paymentAddressStr = KeyIo.encodePaymentAddress(paymentAddress);
    GrpcAPI.Note revNote = getNote(value, paymentAddressStr, rcm, memo);
    revNoteBuilder.setNote(revNote);
    byte[] contractAddress = WalletApi.decodeFromBase58Check(contractAddr);

    GrpcAPI.PrivateShieldedTRC20Parameters.Builder paramBuilder = GrpcAPI
        .PrivateShieldedTRC20Parameters.newBuilder();
    paramBuilder.setAsk(ByteString.copyFrom(ask));
    paramBuilder.setNsk(ByteString.copyFrom(nsk));
    paramBuilder.setOvk(ByteString.copyFrom(ovk));
    paramBuilder.setFromAmount(fromAmount.toString());
    paramBuilder.addShieldedReceives(revNoteBuilder.build());
    paramBuilder.setShieldedTRC20ContractAddress(ByteString.copyFrom(contractAddress));
    return paramBuilder.build();
  }

  private static byte[] triggerGetPath(byte[] contractAddress, long pos) {
    String methodSign = "getPath(uint256)";
    byte[] selector = new byte[4];
    System.arraycopy(Hash.sha3(methodSign.getBytes()), 0, selector, 0, 4);
    SmartContractOuterClass.TriggerSmartContract.Builder triggerBuilder = SmartContractOuterClass
        .TriggerSmartContract.newBuilder();
    triggerBuilder.setContractAddress(ByteString.copyFrom(contractAddress));
    byte[] input = ByteUtil.merge(selector, longTo32Bytes(pos));
    triggerBuilder.setData(ByteString.copyFrom(input));

    GrpcAPI.TransactionExtention transactionExtention = grpcClient.triggerConstantContract(
        triggerBuilder.build());
    Assert.assertEquals(0, transactionExtention.getResult().getCodeValue());
    byte[] result = transactionExtention.getConstantResult(0).toByteArray();
    Assert.assertEquals(1056, result.length);
    return result;
  }

  private static byte[] longTo32Bytes(long value) {
    byte[] longBytes = ByteArray.fromLong(value);
    byte[] zeroBytes = new byte[24];
    return ByteUtil.merge(zeroBytes, longBytes);
  }

  private static long bytes32Tolong(byte[] value) {
    return ByteArray.toLong(value);
  }
}
