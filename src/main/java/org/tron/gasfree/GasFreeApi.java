package org.tron.gasfree;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.apache.commons.lang3.StringUtils.EMPTY;
import static org.tron.common.enums.NetType.MAIN;
import static org.tron.common.utils.Utils.greenBoldHighlight;
import static org.tron.walletserver.WalletApi.decodeFromBase58Check;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.google.common.collect.ImmutableMap;
import com.typesafe.config.Config;
import java.io.IOException;
import java.math.BigInteger;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.security.SignatureException;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.lang3.tuple.Pair;
import org.bouncycastle.util.encoders.Hex;
import org.tron.common.enums.NetType;
import org.tron.common.utils.HttpUtils;
import org.tron.core.config.Configuration;
import org.tron.gasfree.request.GasFreeSubmitRequest;
import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Function;
import org.web3j.abi.datatypes.Type;
import org.web3j.abi.datatypes.generated.Bytes32;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.crypto.ECKeyPair;
import org.web3j.crypto.Hash;
import org.web3j.crypto.Keys;
import org.web3j.crypto.Sign;
import org.web3j.utils.Numeric;

public class GasFreeApi {
  public static final String DOMAIN_TYPE_STRING = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
  public static final String PERMIT_TRANSFER_TYPE_STRING = "PermitTransfer(address token,address serviceProvider,address user,address receiver,uint256 value,uint256 maxFee,uint256 deadline,uint256 version,uint256 nonce)";
  private static final String API_PATH_TOKEN_ALL = "/api/v1/config/token/all";
  private static final String API_PATH_PROVIDER_ALL = "/api/v1/config/provider/all";
  private static final String API_PATH_ADDRESS = "/api/v1/address/";
  private static final String API_PATH_GAS_FREE_SUBMIT = "/api/v1/gasfree/submit";
  private static final String API_PATH_GAS_FREE_TRACE_ID = "/api/v1/gasfree/";
  private static final String GET = "GET";
  private static final String POST = "POST";
  private static final String API_KEY_AND_API_SECRET_APPLY_URL = "https://docs.google.com/forms/d/e/1FAIpQLSc5EB1X8JN7LA4SAVAG99VziXEY6Kv6JxmlBry9rUBlwI-GaQ/viewform";

  public static byte[] keccak256(byte[] input) {
    return Hash.sha3(input);
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

  public static byte[] tronBase58ToBytes32(String base58Address) {
    byte[] decoded = decodeFromBase58Check(base58Address);

    assert decoded != null;
    if (decoded.length != 21 || decoded[0] != 0x41) {
      throw new IllegalArgumentException("Invalid TRON address");
    }

    byte[] addressBytes = Arrays.copyOfRange(decoded, 1, 21);

    byte[] bytes32 = new byte[32];
    System.arraycopy(addressBytes, 0, bytes32, 12, 20);

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

  private static String buildApiPath(NetType netType, String apiPath) {
    String prefix = netType.getGasFree().getApiPrefix();
    return prefix + apiPath;
  }

  public static Pair<String, String> getPair(NetType netType) {
    Config config = Configuration.getByPath("config.conf");
    String apiKey = EMPTY;
    String apiSecret = EMPTY;
    String apiKeyPath = netType == MAIN ? "gasfree.mainnet.apiKey" : "gasfree.testnet.apiKey";
    String apiSecretPath = netType == MAIN ? "gasfree.mainnet.apiSecret" : "gasfree.testnet.apiSecret";
    if (config.hasPath(apiKeyPath)) {
      apiKey = config.getString(apiKeyPath);
    }
    if (config.hasPath(apiSecretPath)) {
      apiSecret = config.getString(apiSecretPath);
    }
    return Pair.of(apiKey, apiSecret);
  }

  private static Map<String, String> buildAuthHeaders(NetType netType, String httpMethod, String path)
      throws NoSuchAlgorithmException, InvalidKeyException {
    long timestamp = System.currentTimeMillis() / 1000;
    String message = httpMethod + path + timestamp;
    String signature = generateSignature(netType, message);
    String apiKey = getPair(netType).getLeft();
    if (StringUtils.isEmpty(apiKey)) {
      throw new IllegalArgumentException("To use the gasfree feature, please first apply for an "
          + greenBoldHighlight("apikey") + " and " + greenBoldHighlight("apiSecret") + ". "
          + "For details, please refer to " + API_KEY_AND_API_SECRET_APPLY_URL);
    }
    return ImmutableMap.of(
        "Timestamp", String.valueOf(timestamp),
        "Authorization", "ApiKey " + apiKey + ":" + signature
    );
  }

  private static String generateSignature(NetType netType, String message) throws NoSuchAlgorithmException, InvalidKeyException {
    Mac sha256HMAC = Mac.getInstance("HmacSHA256");
    String apiSecret = getPair(netType).getRight();
    if (StringUtils.isEmpty(apiSecret)) {
      throw new IllegalArgumentException("To use the gasfree feature, please first apply for an "
          + greenBoldHighlight("apikey") + " and " + greenBoldHighlight("apiSecret") + ". "
          + "For details, please refer to " + API_KEY_AND_API_SECRET_APPLY_URL);
    }
    SecretKeySpec secretKey = new SecretKeySpec(apiSecret.getBytes(UTF_8), "HmacSHA256");
    sha256HMAC.init(secretKey);
    byte[] hash = sha256HMAC.doFinal(message.getBytes(UTF_8));
    return Base64.getEncoder().encodeToString(hash);
  }

  public static String tokenAll(NetType netType)
      throws NoSuchAlgorithmException, InvalidKeyException, IOException {
    String path = buildApiPath(netType, API_PATH_TOKEN_ALL);
    String baseUri = netType.getGasFree().getHttpUrl();
    Map<String, String> headers = buildAuthHeaders(netType, GET, path);

    return HttpUtils.get(baseUri + path, headers);
  }

  public static String providerAll(NetType netType)
      throws NoSuchAlgorithmException, InvalidKeyException, IOException {
    String path = buildApiPath(netType, API_PATH_PROVIDER_ALL);
    String baseUri = netType.getGasFree().getHttpUrl();
    Map<String, String> headers = buildAuthHeaders(netType, GET, path);
    return HttpUtils.get(baseUri + path, headers);
  }

  public static String address(NetType netType, String address)
      throws NoSuchAlgorithmException, InvalidKeyException, IOException {
    String path = buildApiPath(netType, API_PATH_ADDRESS + address);
    String baseUri = netType.getGasFree().getHttpUrl();
    Map<String, String> headers = buildAuthHeaders(netType, GET, path);
    return HttpUtils.get(baseUri + path, headers);
  }

  public static String gasFreeSubmit(NetType netType, GasFreeSubmitRequest gasFreeSubmitRequest)
      throws NoSuchAlgorithmException, InvalidKeyException, IOException {
    String path = buildApiPath(netType, API_PATH_GAS_FREE_SUBMIT);
    String baseUri = netType.getGasFree().getHttpUrl();
    Map<String, String> headers = buildAuthHeaders(netType, POST, path);
    return HttpUtils.postJson(baseUri + path, JSON.toJSONString(gasFreeSubmitRequest), headers);
  }

  public static String gasFreeTrace(NetType netType, String traceId)
      throws NoSuchAlgorithmException, InvalidKeyException, IOException {
    String path = buildApiPath(netType, API_PATH_GAS_FREE_TRACE_ID + traceId);
    String baseUri = netType.getGasFree().getHttpUrl();
    Map<String, String> headers = buildAuthHeaders(netType, GET, path);
    return HttpUtils.get(baseUri + path, headers);
  }

  public static String signOffChain(byte[] hash, String privateKey) {
    ECKeyPair keypair = ECKeyPair.create(new BigInteger(privateKey, 16));
    Sign.SignatureData signature = Sign.signMessage(hash, keypair, false); // no second hash
    byte[] signBytes = abiEncodePacked(signature.getR(), signature.getS(), signature.getV());
    return Hex.toHexString(signBytes);
  }

  public static boolean validateSignOffChain(byte[] hash, String signature, String publicAddress) {
    // parse signatureData
    byte[] signatureBytes = Numeric.hexStringToByteArray(signature);
    // restrict the length of signature
    if (signatureBytes.length != 65) {
      return false;
    }
    byte v = signatureBytes[64];
    if (v < 27) {
      v += 27;
    }
    byte[] r = new byte[32];
    byte[] s = new byte[32];
    System.arraycopy(signatureBytes, 0, r, 0, 32);
    System.arraycopy(signatureBytes, 32, s, 0, 32);
    Sign.SignatureData signatureData = new Sign.SignatureData(v, r, s);

    // calc address
    BigInteger publicKey;
    try {
      publicKey = Sign.signedMessageHashToKey(hash, signatureData);
    } catch (SignatureException e) {
      throw new RuntimeException(e);
    }
    String hexAddress = "0x" + Keys.getAddress(publicKey);
    if (publicAddress.startsWith("0x")) { // eth address
      return hexAddress.equals(publicAddress);
    }
    // tron address, turn hexAddress to tron address
    String address = new org.tron.trident.abi.datatypes.Address(hexAddress).toString();
    return address.equals(publicAddress);
  }

  public static byte[] getDomainSeparator(NetType netType) {
    byte[] domainTypeHash = Hash.sha3(DOMAIN_TYPE_STRING.getBytes());
    byte[] nameHash = Hash.sha3("GasFreeController".getBytes());
    byte[] versionHash = Hash.sha3("V1.0.0".getBytes());
    long chainId = netType.getGasFree().getChainId();
    Uint256 chainIdUint = new Uint256(BigInteger.valueOf(chainId));
    Address address = new Address(Numeric.toHexString(tronBase58ToBytes32(netType.getGasFree().getVerifyingContract())));
    byte[] domainSeparatorAbiEncode = abiEncode(
        new Bytes32(domainTypeHash),
        new Bytes32(nameHash),
        new Bytes32(versionHash),
        chainIdUint,
        address
    );
    // domainSeparator
    return keccak256(domainSeparatorAbiEncode);
  }

  public static byte[] getMessage(NetType netType, GasFreeSubmitRequest gasFreeSubmitRequest)
      throws NoSuchAlgorithmException, IOException, InvalidKeyException {
    byte[] permitTransferTypeHash = Hash.sha3(PERMIT_TRANSFER_TYPE_STRING.getBytes());

    String resp = tokenAll(netType);
    JSONObject root = JSON.parseObject(resp);
    JSONObject data = root.getJSONObject("data");
    JSONArray tokens = data.getJSONArray("tokens");
    if (tokens == null || tokens.isEmpty()) {
      System.out.println("Failed to get tokens information.");
      return new byte[0];
    }
    String tokenAddress;
    long maxFee;
    long activateFee;
    long transferFee;
    JSONObject tokensJSONObject = tokens.getJSONObject(0);
    tokenAddress = tokensJSONObject.getString("tokenAddress");
    activateFee = tokensJSONObject.getLongValue("activateFee");
    transferFee = tokensJSONObject.getLongValue("transferFee");
    maxFee = activateFee + transferFee;
    gasFreeSubmitRequest.setToken(tokenAddress);
    gasFreeSubmitRequest.setMaxFee(maxFee);

    String providerAll = providerAll(netType);
    JSONObject root1 = JSON.parseObject(providerAll);
    JSONObject data1 = root1.getJSONObject("data");
    JSONArray providers = data1.getJSONArray("providers");
    if (providers == null || providers.isEmpty()) {
      System.out.println("Failed to get providers information.");
      return new byte[0];
    }
    String providerAddress;
    long defaultDeadlineDuration;
    JSONObject provider = providers.getJSONObject(0);
    providerAddress = provider.getString("address");
    JSONObject config = provider.getJSONObject("config");
    if (config == null) {
      return new byte[0];
    }
    defaultDeadlineDuration = config.getLongValue("defaultDeadlineDuration");
    gasFreeSubmitRequest.setServiceProvider(providerAddress);

    String addressResp = address(netType, gasFreeSubmitRequest.getUser());
    JSONObject root2 = JSON.parseObject(addressResp);
    JSONObject data2 = root2.getJSONObject("data");
    int nonce = data2.getIntValue("nonce");
    boolean active = data2.getBooleanValue("active");
    System.out.println("Activate Fee: " + (active ? 0 : activateFee));
    System.out.println("Transfer Fee: " + transferFee);
    gasFreeSubmitRequest.setNonce(nonce);
    gasFreeSubmitRequest.setDeadline((System.currentTimeMillis() / 1000) + defaultDeadlineDuration);

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
    return keccak256(messageAbiEncode);
  }

}
