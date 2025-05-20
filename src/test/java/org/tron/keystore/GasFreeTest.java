package org.tron.keystore;

import static org.apache.commons.lang3.StringUtils.EMPTY;
import static org.junit.Assert.assertTrue;
import static org.tron.common.enums.NetType.NILE;
import static org.tron.gasfree.GasFreeApi.CREATION_CODE_STR;
import static org.tron.gasfree.GasFreeApi.DOMAIN_TYPE_STRING;
import static org.tron.gasfree.GasFreeApi.PERMIT_TRANSFER_TYPE_STRING;
import static org.tron.gasfree.GasFreeApi.address;
import static org.tron.gasfree.GasFreeApi.gasFreeSubmit;
import static org.tron.gasfree.GasFreeApi.gasFreeTrace;
import static org.tron.gasfree.GasFreeApi.providerAll;
import static org.tron.gasfree.GasFreeApi.signOffChain;
import static org.tron.gasfree.GasFreeApi.tokenAll;
import static org.tron.gasfree.GasFreeApi.validateSignOffChain;
import static org.tron.walletserver.WalletApi.decodeFromBase58Check;
import static org.tron.walletserver.WalletApi.encode58Check;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import java.io.IOException;
import java.math.BigInteger;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;
import org.tron.common.enums.NetType;
import org.tron.common.utils.HttpUtils;
import org.tron.gasfree.request.GasFreeSubmitRequest;
import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.DynamicBytes;
import org.web3j.abi.datatypes.Function;
import org.web3j.abi.datatypes.Type;
import org.web3j.abi.datatypes.generated.Bytes32;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.crypto.Hash;
import org.web3j.utils.Numeric;

public class GasFreeTest {
  @Test
  public void testHttp() throws IOException {
    String postJson = HttpUtils.postJson("https://api.trongrid.io/walletsolidity/gettransactionbyid",
        "{\"value\":\"11712d6ae2b5dbdfd5d4ebc7a59e0e3291f51ab9338cbe2f387ece1b25f7f5d7\"}");
    System.out.println(postJson);
  }

  public static byte[] keccak256(byte[] input) {
    return Hash.sha3(input);  // 返回 0x 开头的 32 字节 hash
  }

  public static byte[] abiEncodeCall(String functionName, Type<?>... args) {
    Function fn = new Function(functionName, Arrays.asList(args), Collections.emptyList());
    return Numeric.hexStringToByteArray(FunctionEncoder.encode(fn));
  }

  public static byte[] abiEncode(Type<?>... args) {
    return Numeric.hexStringToByteArray(FunctionEncoder.encodeConstructor(Arrays.asList(args)));
  }

  public static byte[] abiEncodePacked(byte[]... parts) {
    int totalLength = Arrays.stream(parts).mapToInt(p -> p.length).sum();
    byte[] result = new byte[totalLength];
    int pos = 0;
    for (byte[] part : parts) {
      System.arraycopy(part, 0, result, pos, part.length);
      pos += part.length;
    }
    return result;
  }

  @Test
  public void test() {
//    abiEncodeCall("initialize", )
    byte[] bytes32s = tronBase58ToBytes32("TLFXfejEMgivFDR2x8qBpukMXd56spmFhz");
    System.out.println("0x" + Numeric.toHexStringNoPrefix(bytes32s));
  }

  public static byte[] tronBase58ToBytes32(String base58Address) {
    byte[] decoded = decodeFromBase58Check(base58Address);

    if (decoded.length != 21 || decoded[0] != 0x41) {
      throw new IllegalArgumentException("Invalid TRON address");
    }

    byte[] addressBytes = Arrays.copyOfRange(decoded, 1, 21);

    byte[] bytes32 = new byte[32];
    System.arraycopy(addressBytes, 0, bytes32, 12, 20); // 右对齐

    return bytes32;
  }

  public static byte[] concat(byte[]... arrays) {
    int totalLength = Arrays.stream(arrays).mapToInt(a -> a.length).sum();
    byte[] result = new byte[totalLength];
    int pos = 0;
    for (byte[] arr : arrays) {
      System.arraycopy(arr, 0, result, pos, arr.length);
      pos += arr.length;
    }
    return result;
  }

  public static byte[] bytecodeHash(String user, String beacon) {
    byte[] creationCode = Numeric.hexStringToByteArray(CREATION_CODE_STR);
    String userHex = Numeric.toHexString(tronBase58ToBytes32(user));
    String beaconHex = Numeric.toHexString(tronBase58ToBytes32(beacon));
    byte[] encodedCall = abiEncodeCall("initialize", new Address(userHex));
    byte[] encodedOuter = abiEncode(new Address(beaconHex), new DynamicBytes(encodedCall));
    byte[] packed = abiEncodePacked(creationCode, encodedOuter);
    return Hash.sha3(packed);
  }

  @Test
  public void testGetGasFreeAddress() {
    byte[] bytecodeHash = bytecodeHash("TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E", "THoYa62ZAqjPGsmFygxx3dLqCHyVbT2VBZ");
    System.out.println("bytecodeHash:" + Numeric.toHexString(bytecodeHash));
//    String salt = Numeric.toHexString(tronBase58ToBytes32("TLFXfejEMgivFDR2x8qBpukMXd56spmFhz"));
//    System.out.println("salt:" + salt);
//    String factory = Numeric.toHexString(decodeFromBase58Check("TSKUEvoSL84jQMKMuCVhr2HcE1Rvm3fe8g"));
//    System.out.println("factory:" + factory);
    byte[] hash = keccak256(
        concat(
//            Numeric.hexStringToByteArray("0x41"),
            decodeFromBase58Check("TNtzqaE9p23tzpN1SHavUCCuzSwrzbHEHE"),
            tronBase58ToBytes32("TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E"),
            bytecodeHash
        ));
    // create2
    byte[] addressBytes = Arrays.copyOfRange(hash, hash.length - 20, hash.length);
    byte[] addressWithPrefix = new byte[21];
    addressWithPrefix[0] = 0x41;
    System.arraycopy(addressBytes, 0, addressWithPrefix, 1, 20);

    String gasFreeAddress = encode58Check(addressWithPrefix);
    System.out.println(gasFreeAddress);
  }

  @Test
  public void testPermitTransferMessageHash() {
    byte[] domainTypeHash = Hash.sha3(DOMAIN_TYPE_STRING.getBytes());
    byte[] nameHash = Hash.sha3("GasFreeController".getBytes());
    byte[] versionHash = Hash.sha3("V1.0.0".getBytes());
    Uint256 chainIdUint = new Uint256(BigInteger.valueOf(3448148188L));
    Address address = new Address(Numeric.toHexString(tronBase58ToBytes32("TNtzqaE9p23tzpN1SHavUCCuzSwrzbHEHE")));
    byte[] domainSeparatorAbiEncode = abiEncode(
        new Bytes32(domainTypeHash),
        new Bytes32(nameHash),
        new Bytes32(versionHash),
        chainIdUint,
        address
    );
    // domainSeparator
    byte[] domainSeparator = keccak256(domainSeparatorAbiEncode);
    System.out.println("domainSeparator:" + Numeric.toHexString(domainSeparator));


    byte[] permitTransferTypeHash = Hash.sha3(PERMIT_TRANSFER_TYPE_STRING.getBytes());
    Address token = new Address(Numeric.toHexString(tronBase58ToBytes32("TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf")));
    Address serviceProvider = new Address(Numeric.toHexString(tronBase58ToBytes32("TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E")));
    Address user = new Address(Numeric.toHexString(tronBase58ToBytes32("TUUSMd58eC3fKx3fn7whxJyr1FR56tgaP8")));
    Address receiver = new Address(Numeric.toHexString(tronBase58ToBytes32("TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT")));
    Uint256 valueUint = new Uint256(BigInteger.valueOf(100000L));
    Uint256 maxFeeUint = new Uint256(BigInteger.valueOf(1000000L));
    Uint256 deadlineUint = new Uint256(BigInteger.valueOf(1747756399L));
    Uint256 versionUint = new Uint256(BigInteger.valueOf(1L));
    Uint256 nonceUint = new Uint256(BigInteger.valueOf(0L));

    byte[] messageAbiEncode = abiEncode(
        new Bytes32(permitTransferTypeHash),
        token,
        serviceProvider,
        user,
        receiver,
        valueUint,
        maxFeeUint,
        deadlineUint,
        versionUint,
        nonceUint
    );
    // message
    byte[] message = keccak256(messageAbiEncode);
    System.out.println("message:" + Numeric.toHexString(message));

    // permitTransferMessageHash
    byte[] concat = concat(
        Numeric.hexStringToByteArray("0x1901"),
        domainSeparator,
        message
    );
    System.out.println("permitTransferMessageHash" + Numeric.toHexString(keccak256(concat)));
  }

  @Test
  public void testTokenAll() throws IOException, NoSuchAlgorithmException, InvalidKeyException {
    String resp = tokenAll(NetType.NILE);
//    String resp = tokenAll(NetType.MAIN);
    System.out.println(resp);
  }

  @Test
  public void testProviderAll() throws IOException, NoSuchAlgorithmException, InvalidKeyException {
    String resp = providerAll(NetType.NILE);
//    String resp = providerAll(NetType.MAIN);
    System.out.println(resp);
  }

  @Test
  public void testAddress() throws IOException, NoSuchAlgorithmException, InvalidKeyException {
    String resp = address(NetType.NILE, "TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E");
//    String resp = address(NetType.MAIN, "TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E");
    System.out.println(resp);
  }

  @Test
  public void testGasFreeSubmit() throws IOException, NoSuchAlgorithmException, InvalidKeyException {
    GasFreeSubmitRequest gasFreeSubmitRequest = new GasFreeSubmitRequest();
    gasFreeSubmitRequest.setUser("TUUSMd58eC3fKx3fn7whxJyr1FR56tgaP8");
    gasFreeSubmitRequest.setReceiver("TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT");
    gasFreeSubmitRequest.setValue(100000L);
    gasFreeSubmitRequest.setMaxFee(2000000L);
    gasFreeSubmitRequest.setVersion(1);

    byte[] domainTypeHash = Hash.sha3(DOMAIN_TYPE_STRING.getBytes());
    byte[] nameHash = Hash.sha3("GasFreeController".getBytes());
    byte[] versionHash = Hash.sha3("V1.0.0".getBytes());
    long chainId = NILE.getGasFree().getChainId();
    Uint256 chainIdUint = new Uint256(BigInteger.valueOf(chainId));
    String gasFreeController = NILE.getGasFree().getVerifyingContract();
    Address address = new Address(Numeric.toHexString(tronBase58ToBytes32(gasFreeController)));
    byte[] domainSeparatorAbiEncode = abiEncode(
        new Bytes32(domainTypeHash),
        new Bytes32(nameHash),
        new Bytes32(versionHash),
        chainIdUint,
        address
    );
    // domainSeparator
    byte[] domainSeparator = keccak256(domainSeparatorAbiEncode);
    System.out.println("domainSeparator:" + Numeric.toHexString(domainSeparator));


    byte[] permitTransferTypeHash = Hash.sha3(PERMIT_TRANSFER_TYPE_STRING.getBytes());

    String resp = tokenAll(NILE);
    JSONObject root = JSON.parseObject(resp);
    JSONObject data = root.getJSONObject("data");
    JSONArray tokens = data.getJSONArray("tokens");
    String tokenAddress = EMPTY;
    if (tokens != null && !tokens.isEmpty()) {
      JSONObject token = tokens.getJSONObject(0);
      tokenAddress = token.getString("tokenAddress");
      System.out.println("tokenAddress: " + tokenAddress);
    }
    gasFreeSubmitRequest.setToken(tokenAddress);

    String providerAll = providerAll(NILE);
    JSONObject root1 = JSON.parseObject(providerAll);
    JSONObject data1 = root1.getJSONObject("data");
    JSONArray providers = data1.getJSONArray("providers");
    String providerAddress = EMPTY;
    if (providers != null && !providers.isEmpty()) {
      JSONObject provider = providers.getJSONObject(0);
      providerAddress = provider.getString("address");
      System.out.println("providerAddress: " + providerAddress);
    }
    gasFreeSubmitRequest.setServiceProvider(providerAddress);

    String addressResp = address(NILE, gasFreeSubmitRequest.getUser());
    JSONObject root2 = JSON.parseObject(addressResp);
    JSONObject data2 = root2.getJSONObject("data");
    int nonce = data2.getIntValue("nonce");
    gasFreeSubmitRequest.setNonce(nonce);
    gasFreeSubmitRequest.setDeadline((System.currentTimeMillis() / 1000) + 60);

    Address token = new Address(Numeric.toHexString(tronBase58ToBytes32(gasFreeSubmitRequest.getToken())));
    Address serviceProvider = new Address(Numeric.toHexString(tronBase58ToBytes32(gasFreeSubmitRequest.getServiceProvider())));
    Address user = new Address(Numeric.toHexString(tronBase58ToBytes32(gasFreeSubmitRequest.getUser())));
    Address receiver = new Address(Numeric.toHexString(tronBase58ToBytes32(gasFreeSubmitRequest.getReceiver())));
    Uint256 valueUint = new Uint256(BigInteger.valueOf(gasFreeSubmitRequest.getValue()));
    Uint256 maxFeeUint = new Uint256(BigInteger.valueOf(gasFreeSubmitRequest.getMaxFee()));
    Uint256 deadlineUint = new Uint256(BigInteger.valueOf(gasFreeSubmitRequest.getDeadline()));
    Uint256 versionUint = new Uint256(BigInteger.valueOf(gasFreeSubmitRequest.getVersion()));
    Uint256 nonceUint = new Uint256(BigInteger.valueOf(gasFreeSubmitRequest.getNonce()));

    byte[] messageAbiEncode = abiEncode(
        new Bytes32(permitTransferTypeHash),
        token,
        serviceProvider,
        user,
        receiver,
        valueUint,
        maxFeeUint,
        deadlineUint,
        versionUint,
        nonceUint
    );
    // message
    byte[] message = keccak256(messageAbiEncode);
    System.out.println("message:" + Numeric.toHexString(message));

    // permitTransferMessageHash
    byte[] concat = concat(
        Numeric.hexStringToByteArray("0x1901"),
        domainSeparator,
        message
    );
    System.out.println("permitTransferMessageHash:" + Numeric.toHexString(keccak256(concat)));
    String privateKey = "3c82f7d8d93b565c0cf25132ddd22b38f8d072cda45461a85a0db7f1f143e3ee";
    String signature = signOffChain(keccak256(concat), privateKey);
    boolean validated = validateSignOffChain(keccak256(concat), signature, "TUUSMd58eC3fKx3fn7whxJyr1FR56tgaP8");
    System.out.println("validateSignOffchain : " + validated);
    assertTrue(validated);
    gasFreeSubmitRequest.setSig(signature);
    System.out.println(JSON.toJSONString(gasFreeSubmitRequest));
    String result = gasFreeSubmit(NetType.NILE, gasFreeSubmitRequest);
//    String result = gasFreeSubmit(NetType.MAIN, gasFreeSubmitRequest);
    System.out.println(result);
  }

  @Test
  public void testTraceId() throws IOException, NoSuchAlgorithmException, InvalidKeyException {
    String resp = gasFreeTrace(NetType.NILE, "6ab4c27c-f66b-4328-b40f-ffdc6cf1ca60");
    System.out.println(resp);
  }
}

