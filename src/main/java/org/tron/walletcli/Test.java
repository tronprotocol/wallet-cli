package org.tron.walletcli;

import com.google.protobuf.Any;
import com.google.protobuf.ByteString;
import com.google.protobuf.InvalidProtocolBufferException;
import java.io.File;
import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Base64.Decoder;
import java.util.Base64.Encoder;
import java.util.List;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.ECKey.ECDSASignature;
import org.tron.common.crypto.Hash;
import org.tron.common.crypto.Sha256Hash;
import org.tron.common.utils.Base58;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.Utils;
import org.tron.keystore.CheckStrength;
import org.tron.core.exception.CipherException;
import org.tron.keystore.Credentials;
import org.tron.keystore.WalletUtils;
import org.tron.protos.Contract;
import org.tron.protos.Contract.TransferContract;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.WalletClient;

public class Test {

  public static Transaction createTransaction(TransferContract contract) {
    return null;
  }

  public static Transaction createTransactionEx(String toAddress, long amount) {
    Transaction.Builder transactionBuilder = Transaction.newBuilder();

    for (int i = 0; i < 10; i++) {
      Transaction.Contract.Builder contractBuilder = Transaction.Contract.newBuilder();
      Contract.TransferContract.Builder transferContractBuilder = Contract.TransferContract
          .newBuilder();
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
    transactionBuilder.getRawDataBuilder();

    Transaction transaction = transactionBuilder.build();
    return transaction;
  }

//  public static Transaction createTransactionAccount() {
//    Transaction.Builder transactionBuilder = Transaction.newBuilder();
//
//    for (int i = 0; i < 10; i++) {
//      Transaction.Contract.Builder contractBuilder = Transaction.Contract.newBuilder();
//      Contract.AccountCreateContract.Builder accountCreateContract = Contract.AccountCreateContract
//          .newBuilder();
//      accountCreateContract.setAccountName(ByteString.copyFrom("zawtest".getBytes()));
//
//      ByteString bsOwner = ByteString.copyFrom(ByteArray
//          .fromHexString("e1a17255ccf15d6b12dcc074ca1152477ccf9b84"));
//      accountCreateContract.setOwnerAddress(bsOwner);
//      try {
//        Any anyTo = Any.pack(accountCreateContract.build());
//        contractBuilder.setParameter(anyTo);
//      } catch (Exception e) {
//        return null;
//      }
//      contractBuilder.setType(Transaction.Contract.ContractType.AccountCreateContract);
//
//      transactionBuilder.getRawDataBuilder().addContract(contractBuilder);
//    }
//    transactionBuilder.getRawDataBuilder();
//
//    Transaction transaction = transactionBuilder.build();
//    return transaction;
//  }

  public static void test64() throws UnsupportedEncodingException {
    Encoder encoder = Base64.getEncoder();
    byte[] encode = encoder.encode("test string ".getBytes());
    String encodeString = new String(encode, "ISO-8859-1");
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


  public static void testECKey() {
    Transaction transaction = createTransactionEx("e1a17255ccf15d6b12dcc074ca1152477ccf9b84", 10);
    byte[] bytes = transaction.toByteArray();

    ECKey eCkey = new ECKey(Utils.getRandom());
    byte[] priKey = eCkey.getPrivKeyBytes();
    byte[] pubKey = eCkey.getPubKey();
    byte[] addresss = eCkey.getAddress();
    System.out.println("prikey ::: " + ByteArray.toHexString(priKey));
    System.out.println("pubKey ::: " + ByteArray.toHexString(pubKey));
    System.out.println("addresss ::: " + ByteArray.toHexString(addresss));
    byte[] msg = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7, 8,
        9, 10, 11, 12, 13, 14, 15};

    byte[] sha256 = Sha256Hash.hash(msg);
    ECDSASignature signature = eCkey.sign(sha256);

    System.out.println("hash:::" + ByteArray.toHexString(sha256));
    System.out.println("r:::" + ByteArray.toHexString(signature.r.toByteArray()));
    System.out.println("s:::" + ByteArray.toHexString(signature.s.toByteArray()));
    System.out.println("id:::" + signature.v);
  }

//  public static void testTransaction() {
//    Transaction transaction = createTransactionAccount();
//    String priKey = "8e812436a0e3323166e1f0e8ba79e19e217b2c4a53c970d4cca0cfb1078979df";
//
//    ECKey eCkey = null;
//    try {
//      BigInteger priK = new BigInteger(priKey, 16);
//      eCkey = ECKey.fromPrivate(priK);
//    } catch (Exception ex) {
//      ex.printStackTrace();
//    }
//    byte[] msg = transaction.getRawData().toByteArray();
//    byte[] sha256 = Hash.sha256(msg);
//    eCkey.sign(sha256);
//
//    ECDSASignature signature = eCkey.sign(sha256);
//
//    System.out.println("msg:::" + ByteArray.toHexString(msg));
//    System.out.println("priKey:::" + ByteArray.toHexString(eCkey.getPrivKeyBytes()));
//    System.out.println("pubKey::" + ByteArray.toHexString(eCkey.getPubKey()));
//    System.out.println("hash:::" + ByteArray.toHexString(sha256));
//    System.out.println("r:::" + ByteArray.toHexString(signature.r.toByteArray()));
//    System.out.println("s:::" + ByteArray.toHexString(signature.s.toByteArray()));
//    System.out.println("id:::" + signature.v);
//  }

  public static void testVerify() {
    String hashBytes = "630211D6CA9440639F4965AA24831EB84815AB6BEF11E8BE6962A8540D861339";
    String priKeyBytes = "8E812436A0E3323166E1F0E8BA79E19E217B2C4A53C970D4CCA0CFB1078979DF";
    String sign = "1D89243F93670AA2F209FD1E0BDACA67E327B78FA54D728628F4EBBF6B7917E5BB0642717EC2234D21BEFAA7577D5FC6B4D47C94F2C0618862CD4C9E3C839C464";
    ECKey eCkey = null;
    String signatureBase64 = "";
    try {
      signatureBase64 = new String(Base64.getEncoder().encode(ByteArray.fromHexString(sign)),
          "UTF-8");

      byte[] pubKey = ECKey
          .signatureToKeyBytes(ByteArray.fromHexString(hashBytes), signatureBase64);
      System.out.println("pubKey::" + ByteArray.toHexString(pubKey));
    } catch (Exception ex) {
      ex.printStackTrace();
    }
  }

  public static void testGenKey() {
    ECKey eCkey = null;
    String priKeyHex = "cba92a516ea09f620a16ff7ee95ce0df1d56550a8babe9964981a7144c8a784a";
    try {
      BigInteger priK = new BigInteger(priKeyHex, 16);
      eCkey = ECKey.fromPrivate(priK);
    } catch (Exception ex) {
      ex.printStackTrace();
      return;
    }

    byte[] pubKey = eCkey.getPubKey();
    byte[] hash = Hash.sha3(Arrays.copyOfRange(pubKey, 1, pubKey.length));
    byte[] hash_ = Hash.sha3(pubKey);
    byte[] address = eCkey.getAddress();
    byte[] hash0 = Sha256Hash.hash(address);
    byte[] hash1 = Sha256Hash.hash(hash0);
    byte[] checkSum = Arrays.copyOfRange(hash1, 0, 4);
    byte[] addchecksum = new byte[address.length + 4];
    System.arraycopy(address, 0, addchecksum, 0, address.length);
    System.arraycopy(checkSum, 0, addchecksum, address.length, 4);
    String base58 = Base58.encode(addchecksum);
    String base58Address = WalletClient.encode58Check(address);

    String pubKeyString = ByteArray.toHexString(pubKey);
    System.out.println("priKeyHex:::" + priKeyHex);
    System.out.println("pubKeyString:::" + pubKeyString);
    System.out.println("hash:::" + ByteArray.toHexString(hash));
    System.out.println("hash_:::" + ByteArray.toHexString(hash_));
    System.out.println("address:::" + ByteArray.toHexString(address));
    System.out.println("hash0:::" + ByteArray.toHexString(hash0));
    System.out.println("hash1:::" + ByteArray.toHexString(hash1));
    System.out.println("checkSum:::" + ByteArray.toHexString(checkSum));
    System.out.println("addchecksum:::" + ByteArray.toHexString(addchecksum));
    System.out.println("base58:::" + base58);
    System.out.println("base58Address:::" + base58Address);
  }

  public static void testSignEx() {
    byte[] priKey = {
        0,
        69,
        242 - 256,
        238 - 256,
        134 - 256,
        57,
        112,
        55,
        243 - 256,
        242 - 256,
        121,
        104,
        182 - 256,
        252 - 256,
        247 - 256,
        242 - 256,
        107,
        230 - 256,
        211 - 256,
        208 - 256,
        167 - 256,
        194 - 256,
        18,
        229 - 256,
        160 - 256,
        229 - 256,
        91,
        179 - 256,
        48,
        96,
        209 - 256,
        78};

    ECKey eCkey = null;
    try {
      BigInteger priK = new BigInteger(priKey);
      eCkey = ECKey.fromPrivate(priK);
    } catch (Exception ex) {
      ex.printStackTrace();
    }

    byte[] priKey1 = eCkey.getPrivKeyBytes();
    byte[] pubKey = eCkey.getPubKey();
    byte[] addresss = eCkey.getAddress();
    System.out.println("prikey ::: " + ByteArray.toHexString(priKey1));
    System.out.println("pubKey ::: " + ByteArray.toHexString(pubKey));
    System.out.println("addresss ::: " + ByteArray.toHexString(addresss));

  }

  public static void testBase58() {
    List<String> hexAddresList = new ArrayList<String>();
    hexAddresList.add("a04154ca3d1de87d61ab9f96891b6b2c359d6e8a94");
    hexAddresList.add("a099357684bc659f5166046b56c95a0e99f1265cbd");
    hexAddresList.add("a0b4750e2cd76e19dca331bf5d089b71c3c2798548");
    hexAddresList.add("a025a3aae39b24a257f95769c701e8d6978ebe9fc5");
    hexAddresList.add("a0559ccf55fadffdf814a42aff331de9688c132612");
    hexAddresList.add("a0904fe896536f4bebc64c95326b5054a2c3d27df6");
    hexAddresList.add("a0807337f180b62a77576377c1d0c9c24df5c0dd62");
    hexAddresList.add("a05430a3f089154e9e182ddd6fe136a62321af22a7");
    hexAddresList.add("a08beaa1a8e2d45367af7bae7c490b9932a4fa4301");
    hexAddresList.add("a0b070b2b58f4328e293dc9d6012f59c263d3a1df6");
    hexAddresList.add("a00a9309758508413039e4bc5a3d113f3ecc55031d");
    hexAddresList.add("a06a17a49648a8ad32055c06f60fa14ae46df94cc1");
    hexAddresList.add("a0ec6525979a351a54fa09fea64beb4cce33ffbb7a");
    hexAddresList.add("a0fab5fbf6afb681e4e37e9d33bddb7e923d6132e5");
    hexAddresList.add("a014eebe4d30a6acb505c8b00b218bdc4733433c68");
    hexAddresList.add("a04711bf7afbdf44557defbdf4c4e7aa6138c6331f");
    hexAddresList.add("A0F25675B364B0E45E2668C1CDD59370136AD8EC2F");
    hexAddresList.add("A04948C2E8A756D9437037DCD8C7E0C73D560CA38D");

    for (String hexString : hexAddresList) {
      byte[] address = ByteArray.fromHexString(hexString);
      String base58 = WalletClient.encode58Check(address);
      System.out.println("hexAddress = " + hexString);
      System.out.println("base58Check = " + base58);
      byte[] decode58 = WalletClient.decodeFromBase58Check(base58);
      System.out.println("decode58 = " + ByteArray.toHexString(decode58));
      if (!Arrays.equals(decode58, address)) {
        System.out.println("Error, address is not equals to  decode58 !!!!");
        return;
      }
    }
  }

  public static void testSha3() {
    String testData = "tools.jb51.net";
    byte[] hash = Hash.sha3(testData.getBytes());
    System.out.println("testData::" + testData);
    System.out.println("hash::" + ByteArray.toHexString(hash));
  }

  public static void testGenerateWalletFile() throws CipherException, IOException {
    String PASSWORD = "Insecure Pa55w0rd";
    String priKeyHex = "cba92a516ea09f620a16ff7ee95ce0df1d56550a8babe9964981a7144c8a784a";
    ECKey eCkey = ECKey.fromPrivate(ByteArray.fromHexString(priKeyHex));
    File file = new File("out");
    String fileName = WalletUtils.generateWalletFile(PASSWORD.getBytes(), eCkey, file, true);
    Credentials credentials = WalletUtils.loadCredentials(PASSWORD.getBytes(), new File(file, fileName));
    String address = credentials.getAddress();
    ECKey ecKeyPair = credentials.getEcKeyPair();
    String prikey = ByteArray.toHexString(ecKeyPair.getPrivKeyBytes());
    System.out.println("address = " + address);
    System.out.println("prikey = " + prikey);

  }

  public static void testPasswordStrength(){
    List<String> passwordList = new ArrayList<String>();
    passwordList.add("ZAQ!xsw2");
    passwordList.add("3EDC4rfv");
    passwordList.add("6yhn7UJM");
    passwordList.add("1q2w3e4r");
    passwordList.add("1q2w#E$R");
    passwordList.add("qwertyuiop");
    passwordList.add("qwertyui");
    passwordList.add("abcdefghijkl");
    passwordList.add("password");
    passwordList.add("p@ssword");
    passwordList.add("p@ssw0rd");
    passwordList.add("1q2w#E$R1111111");
    passwordList.add("1q2w#E$R1234567");
    passwordList.add("abcdef");
    passwordList.add("abcabc");
    passwordList.add("ABCdef");
    passwordList.add("Vipshop123");
    passwordList.add("qwertyui");
    passwordList.add("admin1111");
    passwordList.add("admin1234");
    passwordList.add("admin1235");
    passwordList.add("1q2w3e$R%T^Y/:");

    for (String password : passwordList) {
      int level = CheckStrength.checkPasswordStrength(password.toCharArray());
      System.out.println(password + " strength is " + level);
    }
  }
  public static void main(String[] args) throws Exception {

    testPasswordStrength();
  }
}
