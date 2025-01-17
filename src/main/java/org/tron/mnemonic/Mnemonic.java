package org.tron.mnemonic;

import org.bouncycastle.crypto.digests.SHA256Digest;
import org.bouncycastle.crypto.generators.PKCS5S2ParametersGenerator;
import org.bouncycastle.crypto.generators.SCrypt;
import org.bouncycastle.crypto.params.KeyParameter;
import org.tron.common.crypto.Hash;
import org.tron.common.crypto.SignInterface;
import org.tron.common.utils.ByteArray;
import org.tron.core.exception.CipherException;
import org.tron.keystore.StringUtils;
import org.tron.walletserver.WalletApi;

import javax.crypto.BadPaddingException;
import javax.crypto.Cipher;
import javax.crypto.IllegalBlockSizeException;
import javax.crypto.NoSuchPaddingException;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.InvalidAlgorithmParameterException;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

public class Mnemonic {

  private static final int N_LIGHT = 1 << 12;
  private static final int P_LIGHT = 6;

  private static final int N_STANDARD = 1 << 18;
  private static final int P_STANDARD = 1;

  private static final int R = 8;
  private static final int DKLEN = 32;

  private static final int CURRENT_VERSION = 3;

  private static final String CIPHER = "aes-128-ctr";
  static final String AES_128_CTR = "pbkdf2";
  static final String SCRYPT = "scrypt";

  public static MnemonicFile create(byte[] password, SignInterface ecKeySm2Pair,
                                    String mnemonicWords, int n, int p)
      throws CipherException {
    byte[] salt = generateRandomBytes(32);
    byte[] derivedKey = generateDerivedScryptKey(password, salt, n, R, p, DKLEN);
    byte[] encryptKey = Arrays.copyOfRange(derivedKey, 0, 16);
    byte[] iv = generateRandomBytes(16);
    byte[] mnemonicWordsBytes = mnemonicWords.getBytes();
    byte[] cipherText = performCipherOperation(Cipher.ENCRYPT_MODE, iv, encryptKey,
        mnemonicWordsBytes);
    byte[] mac = generateMac(derivedKey, cipherText);
    return createMnemonicFile(ecKeySm2Pair, cipherText, iv, salt, mac, n, p);
  }

  public static MnemonicFile createStandard(byte[] password, SignInterface ecKeySm2Pair, List<String> mnemonicWords)
      throws CipherException {
    return create(password, ecKeySm2Pair, MnemonicUtils.mnemonicWordsToString(mnemonicWords), N_STANDARD, P_STANDARD);
  }

  public static MnemonicFile createLight(byte[] password, SignInterface ecKeySm2Pair, List<String> mnemonicWords)
      throws CipherException {
    return create(password, ecKeySm2Pair, MnemonicUtils.mnemonicWordsToString(mnemonicWords), N_LIGHT, P_LIGHT);
  }

  private static MnemonicFile createMnemonicFile(SignInterface ecKeySm2Pair,
                                                 byte[] cipherText, byte[] iv, byte[] salt,
                                                 byte[] mac, int n, int p) {
    MnemonicFile MnemonicFile = new MnemonicFile();
    MnemonicFile.setAddress(WalletApi.encode58Check(ecKeySm2Pair.getAddress()));

    MnemonicFile.Crypto crypto = new MnemonicFile.Crypto();
    crypto.setCipher(CIPHER);
    crypto.setCiphertext(ByteArray.toHexString(cipherText));
    MnemonicFile.setCrypto(crypto);

    MnemonicFile.CipherParams cipherParams = new MnemonicFile.CipherParams();
    cipherParams.setIv(ByteArray.toHexString(iv));
    crypto.setCipherparams(cipherParams);

    crypto.setKdf(SCRYPT);
    MnemonicFile.ScryptKdfParams kdfParams = new MnemonicFile.ScryptKdfParams();
    kdfParams.setDklen(DKLEN);
    kdfParams.setN(n);
    kdfParams.setP(p);
    kdfParams.setR(R);
    kdfParams.setSalt(ByteArray.toHexString(salt));
    crypto.setKdfparams(kdfParams);

    crypto.setMac(ByteArray.toHexString(mac));
    MnemonicFile.setCrypto(crypto);
    MnemonicFile.setId(UUID.randomUUID().toString());
    MnemonicFile.setVersion(CURRENT_VERSION);

    return MnemonicFile;
  }

  private static byte[] generateDerivedScryptKey(
      byte[] password, byte[] salt, int n, int r, int p, int dkLen) throws CipherException {
    return SCrypt.generate(password, salt, n, r, p, dkLen);
  }

  private static byte[] generateAes128CtrDerivedKey(
      byte[] password, byte[] salt, int c, String prf) throws CipherException {

    if (!prf.equals("hmac-sha256")) {
      throw new CipherException("Unsupported prf:" + prf);
    }

    PKCS5S2ParametersGenerator gen = new PKCS5S2ParametersGenerator(new SHA256Digest());
    gen.init(password, salt, c);
    return ((KeyParameter) gen.generateDerivedParameters(256)).getKey();
  }

  private static byte[] performCipherOperation(
      int mode, byte[] iv, byte[] encryptKey, byte[] text) throws CipherException {

    try {
      IvParameterSpec ivParameterSpec = new IvParameterSpec(iv);
      Cipher cipher = Cipher.getInstance("AES/CTR/NoPadding");

      SecretKeySpec secretKeySpec = new SecretKeySpec(encryptKey, "AES");
      cipher.init(mode, secretKeySpec, ivParameterSpec);
      return cipher.doFinal(text);
    } catch (NoSuchPaddingException | NoSuchAlgorithmException
        | InvalidAlgorithmParameterException | InvalidKeyException
        | BadPaddingException | IllegalBlockSizeException e) {
      throw new CipherException("Error performing cipher operation", e);
    }
  }

  private static byte[] generateMac(byte[] derivedKey, byte[] cipherText) {
    byte[] result = new byte[16 + cipherText.length];

    System.arraycopy(derivedKey, 16, result, 0, 16);
    System.arraycopy(cipherText, 0, result, 16, cipherText.length);

    return Hash.sha3(result);
  }

  public static byte[] decrypt2MnemonicWordsBytes(byte[] password, MnemonicFile MnemonicFile)
      throws CipherException {
    validate(MnemonicFile);
    MnemonicFile.Crypto crypto = MnemonicFile.getCrypto();

    byte[] mac = ByteArray.fromHexString(crypto.getMac());
    byte[] iv = ByteArray.fromHexString(crypto.getCipherparams().getIv());
    byte[] cipherText = ByteArray.fromHexString(crypto.getCiphertext());
    byte[] derivedKey;

    MnemonicFile.KdfParams kdfParams = crypto.getKdfparams();
    if (kdfParams instanceof MnemonicFile.ScryptKdfParams) {
      MnemonicFile.ScryptKdfParams scryptKdfParams =
          (MnemonicFile.ScryptKdfParams) crypto.getKdfparams();
      int dklen = scryptKdfParams.getDklen();
      int n = scryptKdfParams.getN();
      int p = scryptKdfParams.getP();
      int r = scryptKdfParams.getR();
      byte[] salt = ByteArray.fromHexString(scryptKdfParams.getSalt());
      derivedKey = generateDerivedScryptKey(password, salt, n, r, p, dklen);
    } else if (kdfParams instanceof MnemonicFile.Aes128CtrKdfParams) {
      MnemonicFile.Aes128CtrKdfParams aes128CtrKdfParams =
          (MnemonicFile.Aes128CtrKdfParams) crypto.getKdfparams();
      int c = aes128CtrKdfParams.getC();
      String prf = aes128CtrKdfParams.getPrf();
      byte[] salt = ByteArray.fromHexString(aes128CtrKdfParams.getSalt());

      derivedKey = generateAes128CtrDerivedKey(password, salt, c, prf);
    } else {
      throw new CipherException("Unable to deserialize params: " + crypto.getKdf());
    }

    byte[] derivedMac = generateMac(derivedKey, cipherText);

    if (!Arrays.equals(derivedMac, mac)) {
      throw new CipherException("Invalid password provided");
    }

    byte[] encryptKey = Arrays.copyOfRange(derivedKey, 0, 16);
    StringUtils.clear(derivedKey);
    byte[] mnemonicWords = performCipherOperation(Cipher.DECRYPT_MODE, iv, encryptKey, cipherText);
    StringUtils.clear(encryptKey);

    return mnemonicWords;
  }

  static void validate(MnemonicFile MnemonicFile) throws CipherException {
    MnemonicFile.Crypto crypto = MnemonicFile.getCrypto();
    if (MnemonicFile.getVersion() != CURRENT_VERSION) {
      throw new CipherException("Mnemonic version is not supported");
    }

    if (!crypto.getCipher().equals(CIPHER)) {
      throw new CipherException("Mnemonic cipher is not supported");
    }

    if (!crypto.getKdf().equals(AES_128_CTR) && !crypto.getKdf().equals(SCRYPT)) {
      throw new CipherException("KDF type is not supported");
    }
  }

  public static byte[] generateRandomBytes(int size) {
    byte[] bytes = new byte[size];
    new SecureRandom().nextBytes(bytes);
    return bytes;
  }

}
