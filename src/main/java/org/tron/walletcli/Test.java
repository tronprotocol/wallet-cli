package org.tron.walletcli;

import com.google.protobuf.ByteString;
import com.google.protobuf.InvalidProtocolBufferException;
import java.io.UnsupportedEncodingException;
import java.util.Base64;
import java.util.Base64.Decoder;
import java.util.Base64.Encoder;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.ECKey.ECDSASignature;
import org.tron.common.crypto.Hash;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.Utils;
import org.tron.protos.Contract;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.TXInput;
import org.tron.protos.Protocol.TXOutput;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.Contract.TransferContract;
import com.google.protobuf.Any;

public class Test {

  public static Transaction createTransaction() {
    Transaction.Builder transactionBuilder = Transaction.newBuilder();
    TXInput.Builder txInputBuilder = TXInput.newBuilder();
    TXOutput.Builder txOutputBuilder = TXOutput.newBuilder();

    ByteString bsTxID = ByteString.copyFrom(ByteArray
        .fromHexString("00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF"));
    ByteString bsTo = ByteString.copyFrom(ByteArray
        .fromHexString("00112233445566778899AABBCCDDEEFF00112233"));

    txInputBuilder.getRawDataBuilder().setTxID(bsTxID);

    txInputBuilder.getRawDataBuilder().setVout(0);
    TXInput txInput = txInputBuilder.build();
    transactionBuilder.getRawDataBuilder().addVin(0, txInput);
    txInputBuilder.getRawDataBuilder().setVout(0);
    txInput = txInputBuilder.build();
    transactionBuilder.getRawDataBuilder().addVin(1, txInput);

    txOutputBuilder.setValue(10);
    txOutputBuilder.setPubKeyHash(bsTo);
    TXOutput txOutput = txOutputBuilder.build();
    transactionBuilder.getRawDataBuilder().addVout(0, txOutput);
    transactionBuilder.getRawDataBuilder().setType(Transaction.TransactionType.UtxoType);
    Transaction transaction = transactionBuilder.build();
    return transaction;
  }

  public static Transaction createTransaction(TransferContract contract) {
    return null;
  }

  public static Transaction createTransactionEx(String toAddress, long amount) {
    Transaction.Builder transactionBuilder = Transaction.newBuilder();

    for ( int i = 0; i < 10; i++ ) {
      Transaction.Contract.Builder contractBuilder = Transaction.Contract.newBuilder();
      Contract.TransferContract.Builder transferContractBuilder = Contract.TransferContract.newBuilder();
      transferContractBuilder.setAmount(amount);
      ByteString bsTo = ByteString.copyFrom(ByteArray
          .fromHexString(toAddress));
      ByteString bsOwner = ByteString.copyFrom(ByteArray
          .fromHexString("e1a17255ccf15d6b12dcc074ca1152477ccf9b84"));
      transferContractBuilder.setToAddress(bsTo);
      transferContractBuilder.setOwnerAddress(bsOwner);
      try {
        Any anyTo = Any.pack(transferContractBuilder.build());
        contractBuilder.setParameter(anyTo);
      } catch (Exception e) {
        return null;
      }
      contractBuilder.setType(Transaction.Contract.ContractType.TransferContract);

      transactionBuilder.getRawDataBuilder().addContract(contractBuilder);
      amount++;
    }
    transactionBuilder.getRawDataBuilder().setType(Transaction.TransactionType.ContractType);


    Transaction transaction = transactionBuilder.build();
    return transaction;
  }

  public static void test64() throws UnsupportedEncodingException {
    Encoder encoder = Base64.getEncoder();
    byte[] encode = encoder.encode("test string ".getBytes());
    String   encodeString = new String(encode,"ISO-8859-1");
    System.out.println("encodeString ::: " + encodeString);
  }

  public static void testDecode64()
      throws UnsupportedEncodingException, InvalidProtocolBufferException {


    Decoder decoder = Base64.getDecoder();
    byte[] code64 = "EAEaFGwi77+977+9e++/ve+/ve+/ve+/vXFI77+9J++/vW/vv73vv71P77+9".getBytes();
    byte[] decode = decoder.decode(code64);
    Account account = Account.parseFrom(decode);
    System.out.println("address::::" + ByteArray.toHexString(account.getAddress().toByteArray()));
  }


  public static void testECKey(){
    Transaction transaction = createTransactionEx("e1a17255ccf15d6b12dcc074ca1152477ccf9b84", 10);
    byte[] bytes = transaction.toByteArray();

    ECKey eCkey = new ECKey(Utils.getRandom());
    byte[] priKey = eCkey.getPrivKeyBytes();
    byte[] pubKey = eCkey.getPubKey();
    byte[] addresss = eCkey.getAddress();
    System.out.println("prikey ::: " + ByteArray.toHexString(priKey));
    System.out.println("pubKey ::: " + ByteArray.toHexString(pubKey));
    System.out.println("addresss ::: " + ByteArray.toHexString(addresss));
    byte[] msg = {0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15};

    byte[] sha256 = Hash.sha256(msg);
    ECDSASignature signature = eCkey.sign(sha256);

    System.out.println("hash:::" + ByteArray.toHexString(sha256));
    System.out.println("r:::" + ByteArray.toHexString(signature.r.toByteArray()));
    System.out.println("s:::" + ByteArray.toHexString(signature.s.toByteArray()));
    System.out.println("id:::" + signature.v);
  }

  public static void main(String[] args) throws Exception {
    testDecode64();


/*
    byte[] pubkey1 = new byte[64];
    System.arraycopy(pubKey, 1, pubkey1, 0,64);
    byte[] sha3  = Hash.sha3(pubkey1);
    System.out.println("sha3  ::: " + ByteArray.toHexString(sha3));

    String testString = "79e4ffe0246d841d068b940475ec113e8319d8c30cbfc6f91898eac671c195a837fd52b3a5bf10947d4a76ca0fb679a935e40a056d96412f8ccf1bb435606fea";
    byte[] sha3 = Hash.sha3(testString.getBytes());
    System.out.println("sha3  ::: " + ByteArray.toHexString(sha3));
    byte[] sha256 = Hash.sha256(testString.getBytes());
    System.out.println("sha25 ::: " + ByteArray.toHexString(sha256));
    sha3 = Hash.sha3(testString.getBytes());
    System.out.println("sha3  ::: " + ByteArray.toHexString(sha3));
    Keccak keccak256 = new Keccak(32);
    keccak256.update("12345678".getBytes());
    sha3 = keccak256.digest();
    System.out.println("sha3  ::: " + ByteArray.toHexString(sha3));

    ECDSASignature signature = null;
    try {
      int i = 0;
      while (true) {

        ECKey myKey = new ECKey(Utils.getRandom());
        signature = myKey.sign(sha256);
        ByteString bsSign = ByteString.copyFrom(signature.toByteArray());
        if (bsSign.size() < 65) {

          System.out.println("r:::" + ByteArray.toHexString(signature.r.toByteArray()));
          System.out.println("s:::" + ByteArray.toHexString(signature.s.toByteArray()));

          bsSign = ByteString.copyFrom(signature.toByteArray());
          byte[] address = ECKey.signatureToAddress(sha256,
              TransactionUtils.getBase64FromByteString(bsSign));
          byte[] ecKeyAddress = myKey.getAddress();
          System.out.println("address:::" + ByteArray.toHexString(address));
          System.out.println("ecKeyAddress:::" + ByteArray.toHexString(ecKeyAddress));

          return;
        }
        byte[] address0 = ECKey.signatureToAddress(sha256,
            TransactionUtils.getBase64FromByteString(bsSign));
        byte[] ecKeyAddress0 = myKey.getAddress();
        System.out.println("i::: " + i);
        i++;
      }
    } catch (Exception e) {
      System.out.println("r:::" + ByteArray.toHexString(signature.r.toByteArray()));
      System.out.println("s:::" + ByteArray.toHexString(signature.s.toByteArray()));

      System.out.println("v:::" + signature.v);

      ByteString bsSign = ByteString.copyFrom(signature.toByteArray());
      try {
        byte[] address0 = ECKey.signatureToAddress(sha256,
            TransactionUtils.getBase64FromByteString(bsSign));
      } catch (Exception ee) {

      }

      e.printStackTrace();
      return;
    }*/

  }
}
