package org.tron.keystore;

import static org.tron.trident.core.utils.Utils.decodeFromBase58Check;
import static org.tron.trident.core.utils.Utils.encode58Check;

import java.io.IOException;
import java.math.BigInteger;
import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;
import org.tron.common.utils.HttpUtils;
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
  private static final String creationCodeStr = "0x60a06040526040516105ac3803806105ac83398101604081905261002291610382565b61002c828261003e565b506001600160a01b0316608052610471565b610047826100fb565b6040516001600160a01b038316907f1cf3b03a6cf19fa2baba4df148e9dcabedea7f8a5c07840e207e5c089be95d3e905f90a28051156100ef576100ea826001600160a01b0316635c60da1b6040518163ffffffff1660e01b8152600401602060405180830381865afa1580156100c0573d5f803e3d5ffd5b505050506040513d601f19601f820116820180604052508101906100e4919061043d565b82610209565b505050565b6100f761027c565b5050565b806001600160a01b03163b5f0361013557604051631933b43b60e21b81526001600160a01b03821660048201526024015b60405180910390fd5b807fa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d5080546001600160a01b0319166001600160a01b0392831617905560408051635c60da1b60e01b815290515f92841691635c60da1b9160048083019260209291908290030181865afa1580156101ae573d5f803e3d5ffd5b505050506040513d601f19601f820116820180604052508101906101d2919061043d565b9050806001600160a01b03163b5f036100f757604051634c9c8ce360e01b81526001600160a01b038216600482015260240161012c565b60605f80846001600160a01b0316846040516102259190610456565b5f60405180830381855af49150503d805f811461025d576040519150601f19603f3d011682016040523d82523d5f602084013e610262565b606091505b50909250905061027385838361029d565b95945050505050565b341561029b5760405163b398979f60e01b815260040160405180910390fd5b565b6060826102b2576102ad826102fc565b6102f5565b81511580156102c957506001600160a01b0384163b155b156102f257604051639996b31560e01b81526001600160a01b038516600482015260240161012c565b50805b9392505050565b80511561030c5780518082602001fd5b604051630a12f52160e11b815260040160405180910390fd5b80515f906001600160a81b038116811461033d575f80fd5b6001600160a01b031692915050565b634e487b7160e01b5f52604160045260245ffd5b5f5b8381101561037a578181015183820152602001610362565b50505f910152565b5f8060408385031215610393575f80fd5b61039c83610325565b60208401519092506001600160401b03808211156103b8575f80fd5b818501915085601f8301126103cb575f80fd5b8151818111156103dd576103dd61034c565b604051601f8201601f19908116603f011681019083821181831017156104055761040561034c565b8160405282815288602084870101111561041d575f80fd5b61042e836020830160208801610360565b80955050505050509250929050565b5f6020828403121561044d575f80fd5b6102f582610325565b5f8251610467818460208701610360565b9190910192915050565b6080516101246104885f395f601d01526101245ff3fe6080604052600a600c565b005b60186014601a565b609d565b565b5f7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b0316635c60da1b6040518163ffffffff1660e01b8152600401602060405180830381865afa1580156076573d5f803e3d5ffd5b505050506040513d601f19601f820116820180604052508101906098919060ba565b905090565b365f80375f80365f845af43d5f803e80801560b6573d5ff35b3d5ffd5b5f6020828403121560c9575f80fd5b81516001600160a81b038116811460de575f80fd5b6001600160a01b0316939250505056fea26474726f6e582212201a19cd1340c744d4f2dd20c2563b0a588f92859265dff6c1fd5750b22eef473f64736f6c63430008140033";
  private static final String domainTypeString = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
  private static final String permitTransferTypeString = "PermitTransfer(address token,address serviceProvider,address user,address receiver,uint256 value,uint256 maxFee,uint256 deadline,uint256 version,uint256 nonce)";

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
    byte[] decoded = decodeFromBase58Check(base58Address); // Base58Check 解码

    if (decoded.length != 21 || decoded[0] != 0x41) {
      throw new IllegalArgumentException("Invalid TRON address");
    }

    // 去掉 0x41 前缀，获取 20 字节地址
    byte[] addressBytes = Arrays.copyOfRange(decoded, 1, 21);

    // 创建 32 字节数组（前 12 字节补零）
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
    byte[] creationCode = Numeric.hexStringToByteArray(creationCodeStr);
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
    byte[] domainTypeHash = Hash.sha3(domainTypeString.getBytes());
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
    byte[] domainSeparator = keccak256(domainSeparatorAbiEncode);
    System.out.println("domainSeparator:" + Numeric.toHexString(domainSeparator));


    byte[] permitTransferTypeHash = Hash.sha3(permitTransferTypeString.getBytes());
    Address token = new Address(Numeric.toHexString(tronBase58ToBytes32("TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf")));
    Address serviceProvider = new Address(Numeric.toHexString(tronBase58ToBytes32("TQ6qStrS2ZJ96gieZJC8AurTxwqJETmjfp")));
    Address user = new Address(Numeric.toHexString(tronBase58ToBytes32("TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E")));
    Address receiver = new Address(Numeric.toHexString(tronBase58ToBytes32("TQ6qStrS2ZJ96gieZJC8AurTxwqJETmjfp")));
    Uint256 valueUint = new Uint256(BigInteger.valueOf(1000000L));
    Uint256 maxFeeUint = new Uint256(BigInteger.valueOf(1000000L));
    Uint256 deadlineUint = new Uint256(BigInteger.valueOf(1731066521L));
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
}
