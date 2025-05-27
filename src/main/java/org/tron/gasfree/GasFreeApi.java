package org.tron.gasfree;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.apache.commons.lang3.StringUtils.EMPTY;
import static org.tron.common.enums.NetType.MAIN;
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
import org.web3j.abi.datatypes.DynamicBytes;
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
  public static final String CREATION_CODE_STR = "0x60a06040526040516105ac3803806105ac83398101604081905261002291610382565b61002c828261003e565b506001600160a01b0316608052610471565b610047826100fb565b6040516001600160a01b038316907f1cf3b03a6cf19fa2baba4df148e9dcabedea7f8a5c07840e207e5c089be95d3e905f90a28051156100ef576100ea826001600160a01b0316635c60da1b6040518163ffffffff1660e01b8152600401602060405180830381865afa1580156100c0573d5f803e3d5ffd5b505050506040513d601f19601f820116820180604052508101906100e4919061043d565b82610209565b505050565b6100f761027c565b5050565b806001600160a01b03163b5f0361013557604051631933b43b60e21b81526001600160a01b03821660048201526024015b60405180910390fd5b807fa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d5080546001600160a01b0319166001600160a01b0392831617905560408051635c60da1b60e01b815290515f92841691635c60da1b9160048083019260209291908290030181865afa1580156101ae573d5f803e3d5ffd5b505050506040513d601f19601f820116820180604052508101906101d2919061043d565b9050806001600160a01b03163b5f036100f757604051634c9c8ce360e01b81526001600160a01b038216600482015260240161012c565b60605f80846001600160a01b0316846040516102259190610456565b5f60405180830381855af49150503d805f811461025d576040519150601f19603f3d011682016040523d82523d5f602084013e610262565b606091505b50909250905061027385838361029d565b95945050505050565b341561029b5760405163b398979f60e01b815260040160405180910390fd5b565b6060826102b2576102ad826102fc565b6102f5565b81511580156102c957506001600160a01b0384163b155b156102f257604051639996b31560e01b81526001600160a01b038516600482015260240161012c565b50805b9392505050565b80511561030c5780518082602001fd5b604051630a12f52160e11b815260040160405180910390fd5b80515f906001600160a81b038116811461033d575f80fd5b6001600160a01b031692915050565b634e487b7160e01b5f52604160045260245ffd5b5f5b8381101561037a578181015183820152602001610362565b50505f910152565b5f8060408385031215610393575f80fd5b61039c83610325565b60208401519092506001600160401b03808211156103b8575f80fd5b818501915085601f8301126103cb575f80fd5b8151818111156103dd576103dd61034c565b604051601f8201601f19908116603f011681019083821181831017156104055761040561034c565b8160405282815288602084870101111561041d575f80fd5b61042e836020830160208801610360565b80955050505050509250929050565b5f6020828403121561044d575f80fd5b6102f582610325565b5f8251610467818460208701610360565b9190910192915050565b6080516101246104885f395f601d01526101245ff3fe6080604052600a600c565b005b60186014601a565b609d565b565b5f7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316635c60da1b6040518163ffffffff1660e01b8152600401602060405180830381865afa1580156076573d5f803e3d5ffd5b505050506040513d601f19601f820116820180604052508101906098919060ba565b905090565b365f80375f80365f845af43d5f803e80801560b6573d5ff35b3d5ffd5b5f6020828403121560c9575f80fd5b81516001600160a81b038116811460de575f80fd5b6001600160a01b0316939250505056fea26474726f6e582212201a19cd1340c744d4f2dd20c2563b0a588f92859265dff6c1fd5750b22eef473f64736f6c63430008140033";
  public static final String DOMAIN_TYPE_STRING = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
  public static final String PERMIT_TRANSFER_TYPE_STRING = "PermitTransfer(address token,address serviceProvider,address user,address receiver,uint256 value,uint256 maxFee,uint256 deadline,uint256 version,uint256 nonce)";
  private static final String API_PATH_TOKEN_ALL = "/api/v1/config/token/all";
  private static final String API_PATH_PROVIDER_ALL = "/api/v1/config/provider/all";
  private static final String API_PATH_ADDRESS = "/api/v1/address/";
  private static final String API_PATH_GAS_FREE_SUBMIT = "/api/v1/gasfree/submit";
  private static final String API_PATH_GAS_FREE_TRACE_ID = "/api/v1/gasfree/";
  private static final String GET = "GET";
  private static final String POST = "POST";

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

  public static byte[] bytecodeHash(String user, String beacon) {
    byte[] creationCode = Numeric.hexStringToByteArray(CREATION_CODE_STR);
    String userHex = Numeric.toHexString(tronBase58ToBytes32(user));
    String beaconHex = Numeric.toHexString(tronBase58ToBytes32(beacon));
    byte[] encodedCall = abiEncodeCall("initialize", new Address(userHex));
    byte[] encodedOuter = abiEncode(new Address(beaconHex), new DynamicBytes(encodedCall));
    byte[] packed = abiEncodePacked(creationCode, encodedOuter);
    return Hash.sha3(packed);
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
      throw new IllegalArgumentException("To use the gasfree feature, please first apply for an " +
          "apikey and apiSecret. For details, please refer to " +
          "https://docs.google.com/forms/d/e/1FAIpQLSc5EB1X8JN7LA4SAVAG99VziXEY6Kv6JxmlBry9rUBlwI-GaQ/viewform");
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
      throw new IllegalArgumentException("To use the gasfree feature, please first apply for an " +
          "apikey and apiSecret. For details, please refer to " +
          "https://docs.google.com/forms/d/e/1FAIpQLSc5EB1X8JN7LA4SAVAG99VziXEY6Kv6JxmlBry9rUBlwI-GaQ/viewform");
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
    String tokenAddress = EMPTY;
    long maxFee = 0;
    if (tokens != null && !tokens.isEmpty()) {
      JSONObject token = tokens.getJSONObject(0);
      tokenAddress = token.getString("tokenAddress");
      long activateFee = token.getLongValue("activateFee");
      long transferFee = token.getLongValue("transferFee");
      maxFee = activateFee + transferFee;
    }
    gasFreeSubmitRequest.setToken(tokenAddress);
    gasFreeSubmitRequest.setMaxFee(maxFee);

    String providerAll = providerAll(netType);
    JSONObject root1 = JSON.parseObject(providerAll);
    JSONObject data1 = root1.getJSONObject("data");
    JSONArray providers = data1.getJSONArray("providers");
    String providerAddress = EMPTY;
    if (providers != null && !providers.isEmpty()) {
      JSONObject provider = providers.getJSONObject(0);
      providerAddress = provider.getString("address");
    }
    gasFreeSubmitRequest.setServiceProvider(providerAddress);

    String addressResp = address(netType, gasFreeSubmitRequest.getUser());
    JSONObject root2 = JSON.parseObject(addressResp);
    JSONObject data2 = root2.getJSONObject("data");
    int nonce = data2.getIntValue("nonce");
    gasFreeSubmitRequest.setNonce(nonce);
    gasFreeSubmitRequest.setDeadline((System.currentTimeMillis() / 1000) + 300);

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
