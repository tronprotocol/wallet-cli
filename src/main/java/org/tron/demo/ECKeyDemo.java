package org.tron.demo;

import static java.util.Arrays.copyOfRange;

import java.math.BigInteger;
import java.util.Arrays;
import org.spongycastle.math.ec.ECPoint;
import org.springframework.util.StringUtils;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.Hash;
import org.tron.common.crypto.Sha256Hash;
import org.tron.common.utils.Base58;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.Utils;
import org.tron.core.exception.CipherException;
import org.tron.walletserver.WalletClient;

public class ECKeyDemo {

  private static byte[] private2PublicDemo(byte[] privateKey) {
    BigInteger privKey = new BigInteger(1, privateKey);
    ECPoint point = ECKey.CURVE.getG().multiply(privKey);
    return point.getEncoded(false);
  }

  private static byte[] public2AddressDemo(byte[] publicKey) {
    byte[] hash = Hash.sha3(copyOfRange(publicKey, 1, publicKey.length));
    System.out.println("sha3 = " + ByteArray.toHexString(hash));
    byte[] address = copyOfRange(hash, 11, hash.length);
    address[0] = WalletClient.getAddressPreFixByte();
    return address;
  }

  public static String address2Encode58CheckDemo(byte[] input) {
    byte[] hash0 = Sha256Hash.hash(input);
    System.out.println("sha256_0: " + ByteArray.toHexString(hash0));

    byte[] hash1 = Sha256Hash.hash(hash0);
    System.out.println("sha256_1: " + ByteArray.toHexString(hash1));

    byte[] inputCheck = new byte[input.length + 4];
    System.out.println("checkSum: " + ByteArray.toHexString(copyOfRange(hash1, 0, 4)));

    System.arraycopy(input, 0, inputCheck, 0, input.length);
    System.arraycopy(hash1, 0, inputCheck, input.length, 4);
    System.out.println("addchecksum: " + ByteArray.toHexString(inputCheck));

    return Base58.encode(inputCheck);
  }

  private static String private2Address(byte[] privateKey) throws CipherException {
    ECKey eCkey;
    if (StringUtils.isEmpty(privateKey)) {
      eCkey = new ECKey(Utils.getRandom());  //Gen new Keypair
    } else {
      eCkey = ECKey.fromPrivate(privateKey);
    }
    System.out.println("Private Key: " + ByteArray.toHexString(eCkey.getPrivKeyBytes()));

    byte[] publicKey0 = eCkey.getPubKey();
    byte[] publicKey1 = private2PublicDemo(eCkey.getPrivKeyBytes());
    if (!Arrays.equals(publicKey0, publicKey1)){
      throw new CipherException("publickey error");
    }
    System.out.println("Public Key: " + ByteArray.toHexString(publicKey0));

    byte[] address0 = eCkey.getAddress();
    byte[] address1 = public2AddressDemo(publicKey0);
    if (!Arrays.equals(address0, address1)){
      throw new CipherException("address error");
    }
    System.out.println("Address: " + ByteArray.toHexString(address0));

    String base58checkAddress0 = WalletClient.encode58Check(address0);
    String base58checkAddress1 = address2Encode58CheckDemo(address0);
    if (!base58checkAddress0.equals(base58checkAddress1)){
      throw new CipherException("base58checkAddress error");
    }

    return base58checkAddress1;
  }

  public static void main(String[] args) throws CipherException {
    String privateKey = "F43EBCC94E6C257EDBE559183D1A8778B2D5A08040902C0F0A77A3343A1D0EA5";
    String address = private2Address(ByteArray.fromHexString(privateKey));
    System.out.println("base58Address: " + address);

    System.out.println("================================================================\r\n");

    address = private2Address(null);
    System.out.println("base58Address: " + address);

  }
}
