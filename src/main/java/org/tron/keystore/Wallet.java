package org.tron.keystore;

import org.bouncycastle.crypto.digests.SHA256Digest;
import org.bouncycastle.crypto.generators.PKCS5S2ParametersGenerator;
import org.bouncycastle.crypto.generators.SCrypt;
import org.bouncycastle.crypto.params.KeyParameter;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.Hash;
import org.tron.common.crypto.SignInterface;
import org.tron.common.crypto.pqc.PQSchemeRegistry;
import org.tron.common.crypto.pqc.PQSignature;
import org.tron.common.crypto.sm2.SM2;
import org.tron.common.utils.ByteArray;
import org.tron.core.exception.CipherException;
import org.tron.protos.Protocol.PQScheme;
import org.tron.walletserver.WalletApi;

import javax.crypto.BadPaddingException;
import javax.crypto.Cipher;
import javax.crypto.IllegalBlockSizeException;
import javax.crypto.NoSuchPaddingException;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidAlgorithmParameterException;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.UUID;

/**
 * <p>Ethereum wallet file management. For reference, refer to <a href="https://github.com/ethereum/wiki/wiki/Web3-Secret-Storage-Definition">
 * Web3 Secret Storage Definition</a> or the <a href="https://github.com/ethereum/go-ethereum/blob/master/accounts/key_store_passphrase.go">
 * Go Ethereum client implementation</a>.</p>
 *
 * <p><strong>Note:</strong> the Bouncy Castle Scrypt implementation {@link SCrypt}, fails to comply
 * with the following Ethereum reference <a href="https://github.com/ethereum/wiki/wiki/Web3-Secret-Storage-Definition#scrypt">
 * Scrypt test vector</a>:</p>
 *
 * <pre>
 * {@code
 * // Only value of r that cost (as an int) could be exceeded for is 1
 * if (r == 1 && N_STANDARD > 65536)
 * {
 *     throw new IllegalArgumentException("Cost parameter N_STANDARD must be > 1 and < 65536.");
 * }
 * }
 * </pre>
 */
public class Wallet {

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

  public static WalletFile create(byte[] password, SignInterface ecKeySm2Pair, int n, int p)
      throws CipherException {

    byte[] salt = generateRandomBytes(32);

    byte[] derivedKey = generateDerivedScryptKey(password, salt, n, R, p, DKLEN);

    byte[] encryptKey = Arrays.copyOfRange(derivedKey, 0, 16);
    byte[] iv = generateRandomBytes(16);

    byte[] privateKeyBytes = ecKeySm2Pair.getPrivKeyBytes();

    byte[] cipherText = performCipherOperation(Cipher.ENCRYPT_MODE, iv, encryptKey,
        privateKeyBytes);

    byte[] mac = generateMac(derivedKey, cipherText);

    return createWalletFile(ecKeySm2Pair, cipherText, iv, salt, mac, n, p);
  }

  public static WalletFile createLedger(byte[] password, int n, int p
      , String address, String path)
      throws CipherException {

    byte[] salt = generateRandomBytes(32);

    byte[] derivedKey = generateDerivedScryptKey(password, salt, n, R, p, DKLEN);

    byte[] encryptKey = Arrays.copyOfRange(derivedKey, 0, 16);
    byte[] iv = generateRandomBytes(16);

    byte[] pathBytes = path.getBytes(StandardCharsets.UTF_8);

    byte[] cipherText = performCipherOperation(Cipher.ENCRYPT_MODE, iv, encryptKey,
        pathBytes);

    byte[] mac = generateMac(derivedKey, cipherText);

    return createLedgerWalletFile(address, cipherText, iv, salt, mac, n, p);
  }

  public static WalletFile createStandard(byte[] password, SignInterface ecKeySm2Pair)
      throws CipherException {
    return create(password, ecKeySm2Pair, N_STANDARD, P_STANDARD);
  }
  public static WalletFile createStandardLedger(byte[] password
      , String address, String path)
      throws CipherException {
    return createLedger(password, N_STANDARD, P_STANDARD,address, path);
  }
  public static WalletFile createLight(byte[] password, SignInterface ecKeySm2Pair)
      throws CipherException {
    return create(password, ecKeySm2Pair, N_LIGHT, P_LIGHT);
  }
  private static WalletFile createWalletFile(
          SignInterface ecKeySm2Pair, byte[] cipherText, byte[] iv, byte[] salt, byte[] mac,
          int n, int p) {

    WalletFile walletFile = new WalletFile();
    walletFile.setAddress(WalletApi.encode58Check(ecKeySm2Pair.getAddress()));

    WalletFile.Crypto crypto = new WalletFile.Crypto();
    crypto.setCipher(CIPHER);
    crypto.setCiphertext(ByteArray.toHexString(cipherText));
    walletFile.setCrypto(crypto);

    WalletFile.CipherParams cipherParams = new WalletFile.CipherParams();
    cipherParams.setIv(ByteArray.toHexString(iv));
    crypto.setCipherparams(cipherParams);

    crypto.setKdf(SCRYPT);
    WalletFile.ScryptKdfParams kdfParams = new WalletFile.ScryptKdfParams();
    kdfParams.setDklen(DKLEN);
    kdfParams.setN(n);
    kdfParams.setP(p);
    kdfParams.setR(R);
    kdfParams.setSalt(ByteArray.toHexString(salt));
    crypto.setKdfparams(kdfParams);

    crypto.setMac(ByteArray.toHexString(mac));
    walletFile.setCrypto(crypto);
    walletFile.setId(UUID.randomUUID().toString());
    walletFile.setVersion(CURRENT_VERSION);

    return walletFile;
  }
  private static WalletFile createLedgerWalletFile(
      String address, byte[] cipherText, byte[] iv, byte[] salt, byte[] mac,
      int n, int p) {

    WalletFile walletFile = new WalletFile();
    walletFile.setAddress(address);

    WalletFile.Crypto crypto = new WalletFile.Crypto();
    crypto.setCipher(CIPHER);
    crypto.setCiphertext(ByteArray.toHexString(cipherText));
    walletFile.setCrypto(crypto);

    WalletFile.CipherParams cipherParams = new WalletFile.CipherParams();
    cipherParams.setIv(ByteArray.toHexString(iv));
    crypto.setCipherparams(cipherParams);

    crypto.setKdf(SCRYPT);
    WalletFile.ScryptKdfParams kdfParams = new WalletFile.ScryptKdfParams();
    kdfParams.setDklen(DKLEN);
    kdfParams.setN(n);
    kdfParams.setP(p);
    kdfParams.setR(R);
    kdfParams.setSalt(ByteArray.toHexString(salt));
    crypto.setKdfparams(kdfParams);

    crypto.setMac(ByteArray.toHexString(mac));
    walletFile.setCrypto(crypto);
    walletFile.setId(UUID.randomUUID().toString());
    walletFile.setVersion(CURRENT_VERSION);

    return walletFile;
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

    // Java 8 supports this, but you have to convert the password to a character array, see
    // http://stackoverflow.com/a/27928435/3211687

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

  public static byte[] decrypt2PrivateBytes(byte[] password, WalletFile walletFile)
      throws CipherException {

    validate(walletFile);

    WalletFile.Crypto crypto = walletFile.getCrypto();

    byte[] mac = ByteArray.fromHexString(crypto.getMac());
    byte[] iv = ByteArray.fromHexString(crypto.getCipherparams().getIv());
    byte[] cipherText = ByteArray.fromHexString(crypto.getCiphertext());

    byte[] derivedKey;

    WalletFile.KdfParams kdfParams = crypto.getKdfparams();
    if (kdfParams instanceof WalletFile.ScryptKdfParams) {
      WalletFile.ScryptKdfParams scryptKdfParams =
          (WalletFile.ScryptKdfParams) crypto.getKdfparams();
      int dklen = scryptKdfParams.getDklen();
      int n = scryptKdfParams.getN();
      int p = scryptKdfParams.getP();
      int r = scryptKdfParams.getR();
      byte[] salt = ByteArray.fromHexString(scryptKdfParams.getSalt());
      derivedKey = generateDerivedScryptKey(password, salt, n, r, p, dklen);
    } else if (kdfParams instanceof WalletFile.Aes128CtrKdfParams) {
      WalletFile.Aes128CtrKdfParams aes128CtrKdfParams =
          (WalletFile.Aes128CtrKdfParams) crypto.getKdfparams();
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
    byte[] privateKey = performCipherOperation(Cipher.DECRYPT_MODE, iv, encryptKey, cipherText);
    StringUtils.clear(encryptKey);

    return privateKey;
  }

  public static boolean validPassword (byte[] password, WalletFile walletFile)
      throws CipherException {

    validate(walletFile);

    // PQ keystores may be seed-only (no main ciphertext/mac), so the ECDSA-style
    // ciphertext/mac check below would wrongly report "Invalid password". Route
    // them through a MAC-only validation path that does not decrypt key material
    // or construct a signer, so no private-key bytes leak into heap. The
    // non-null + non-empty scheme test matches how the rest of the codebase
    // distinguishes PQ wallets from legacy ECDSA ones (scheme null/empty == ECDSA).
    if (walletFile.getScheme() != null && !walletFile.getScheme().isEmpty()) {
      return validatePasswordPQ(password, walletFile);
    }

    WalletFile.Crypto crypto = walletFile.getCrypto();

    byte[] mac = ByteArray.fromHexString(crypto.getMac());
    byte[] cipherText = ByteArray.fromHexString(crypto.getCiphertext());

    byte[] derivedKey;

    WalletFile.KdfParams kdfParams = crypto.getKdfparams();
    if (kdfParams instanceof WalletFile.ScryptKdfParams) {
      WalletFile.ScryptKdfParams scryptKdfParams =
          (WalletFile.ScryptKdfParams) crypto.getKdfparams();
      int dklen = scryptKdfParams.getDklen();
      int n = scryptKdfParams.getN();
      int p = scryptKdfParams.getP();
      int r = scryptKdfParams.getR();
      byte[] salt = ByteArray.fromHexString(scryptKdfParams.getSalt());
      derivedKey = generateDerivedScryptKey(password, salt, n, r, p, dklen);
    } else if (kdfParams instanceof WalletFile.Aes128CtrKdfParams) {
      WalletFile.Aes128CtrKdfParams aes128CtrKdfParams =
          (WalletFile.Aes128CtrKdfParams) crypto.getKdfparams();
      int c = aes128CtrKdfParams.getC();
      String prf = aes128CtrKdfParams.getPrf();
      byte[] salt = ByteArray.fromHexString(aes128CtrKdfParams.getSalt());

      derivedKey = generateAes128CtrDerivedKey(password, salt, c, prf);
    } else {
      throw new CipherException("Unable to deserialize params: " + crypto.getKdf());
    }

    byte[] derivedMac = generateMac(derivedKey, cipherText);
    StringUtils.clear(derivedKey);
    if (!Arrays.equals(derivedMac, mac)) {
      throw new CipherException("Invalid password provided");
    }

    return true;
  }

  public static ECKey decrypt(byte[] password, WalletFile walletFile)
      throws CipherException {
    byte[] privateKey = decrypt2PrivateBytes(password, walletFile);
    ECKey ecKey = ECKey.fromPrivate(privateKey);
    StringUtils.clear(privateKey);
    return ecKey;
  }
  public static SM2 decryptSM2(byte[] password, WalletFile walletFile)
          throws CipherException {
    byte[] privateKey = decrypt2PrivateBytes(password, walletFile);
    SM2 sm2 = SM2.fromPrivate(privateKey);
    StringUtils.clear(privateKey);
    return sm2;
  }

  // Encrypt a PQ wallet under scrypt + AES-128-CTR. Either segment (the
  // scheme-specific persisted private key, or the scheme-specific keygen seed)
  // may be persisted; at least one must be supplied. When both are supplied a
  // single scrypt run produces a derived key DK that is shared by both
  // segments: DK[0..16] keys AES-CTR, DK[16..32] keys the MAC. Each segment
  // gets an INDEPENDENT random IV (AES-CTR reuses keystream if IVs collide
  // under a shared key) and its own Keccak-256 MAC over (DK[16..32] ‖ ciphertext).
  public static WalletFile createPQ(byte[] password, PQScheme scheme,
      byte[] extendedPrivateKey, byte[] seed, byte[] publicKey, int n, int p)
      throws CipherException {
    if (scheme == null || !PQSchemeRegistry.contains(scheme)) {
      throw new CipherException("Unsupported PQ scheme: " + scheme);
    }
    if (publicKey == null
        || publicKey.length != PQSchemeRegistry.getPublicKeyLength(scheme)) {
      throw new CipherException("Invalid PQ public key length for " + scheme.name());
    }
    if (extendedPrivateKey == null && seed == null) {
      throw new CipherException(
          "createPQ requires at least one of extendedPrivateKey or seed");
    }
    int expectedExtLen = PQSchemeRegistry.getPersistedPrivateKeyLength(scheme);
    if (extendedPrivateKey != null && extendedPrivateKey.length != expectedExtLen) {
      throw new CipherException("Invalid extended private key length: expected "
          + expectedExtLen + " for " + scheme.name());
    }
    int expectedSeedLen = PQSchemeRegistry.getSeedLength(scheme);
    if (seed != null && seed.length != expectedSeedLen) {
      throw new CipherException("Invalid seed length: expected "
          + expectedSeedLen + " bytes for " + scheme.name());
    }
    if (extendedPrivateKey != null) {
      byte[] derivedPublicKey = PQSchemeRegistry
          .fromPersistedPrivateKey(scheme, extendedPrivateKey).getPublicKey();
      if (!Arrays.equals(derivedPublicKey, publicKey)) {
        throw new CipherException("Extended private key does not match supplied public key");
      }
    }
    if (seed != null) {
      byte[] derivedPublicKey = PQSchemeRegistry.fromSeed(scheme, seed).getPublicKey();
      if (!Arrays.equals(derivedPublicKey, publicKey)) {
        throw new CipherException("Seed does not match supplied public key");
      }
    }

    byte[] salt = generateRandomBytes(32);
    byte[] derivedKey = generateDerivedScryptKey(password, salt, n, R, p, DKLEN);
    byte[] encryptKey = Arrays.copyOfRange(derivedKey, 0, 16);
    try {
      byte[] extIv = null;
      byte[] extCipherText = null;
      byte[] extMac = null;
      if (extendedPrivateKey != null) {
        extIv = generateRandomBytes(16);
        extCipherText = performCipherOperation(Cipher.ENCRYPT_MODE, extIv, encryptKey,
            extendedPrivateKey);
        extMac = generateMac(derivedKey, extCipherText);
      }

      byte[] seedIv = null;
      byte[] seedCipherText = null;
      byte[] seedMac = null;
      if (seed != null) {
        seedIv = generateRandomBytes(16);
        // Independent-IV invariant: AES-CTR under a shared key with a colliding
        // IV reveals the XOR of the two plaintexts. SecureRandom.nextBytes makes
        // a collision astronomically unlikely, but enforce it explicitly anyway.
        while (extIv != null && Arrays.equals(seedIv, extIv)) {
          seedIv = generateRandomBytes(16);
        }
        seedCipherText = performCipherOperation(Cipher.ENCRYPT_MODE, seedIv, encryptKey,
            seed);
        seedMac = generateMac(derivedKey, seedCipherText);
      }

      return createPQWalletFile(scheme, publicKey,
          extCipherText, extIv, extMac,
          seedCipherText, seedIv, seedMac,
          salt, n, p);
    } finally {
      StringUtils.clear(encryptKey);
      StringUtils.clear(derivedKey);
    }
  }

  public static WalletFile createStandardPQ(byte[] password, PQScheme scheme,
      byte[] extendedPrivateKey, byte[] seed, byte[] publicKey) throws CipherException {
    return createPQ(password, scheme, extendedPrivateKey, seed, publicKey,
        N_STANDARD, P_STANDARD);
  }

  // Back-compat overload retained for callers that only supply the extended
  // private key (no seed available). Persists the ext segment only.
  public static WalletFile createStandardPQ(byte[] password, PQScheme scheme,
      byte[] extendedPrivateKey, byte[] publicKey) throws CipherException {
    return createPQ(password, scheme, extendedPrivateKey, null, publicKey,
        N_STANDARD, P_STANDARD);
  }

  private static WalletFile createPQWalletFile(PQScheme scheme, byte[] publicKey,
      byte[] extCipherText, byte[] extIv, byte[] extMac,
      byte[] seedCipherText, byte[] seedIv, byte[] seedMac,
      byte[] salt, int n, int p) {
    WalletFile walletFile = new WalletFile();
    walletFile.setScheme(scheme.name());
    walletFile.setAddress(
        WalletApi.encode58Check(PQSchemeRegistry.computeAddress(scheme, publicKey)));

    WalletFile.Crypto crypto = new WalletFile.Crypto();
    crypto.setCipher(CIPHER);

    if (extCipherText != null) {
      crypto.setCiphertext(ByteArray.toHexString(extCipherText));
      WalletFile.CipherParams cipherParams = new WalletFile.CipherParams();
      cipherParams.setIv(ByteArray.toHexString(extIv));
      crypto.setCipherparams(cipherParams);
      crypto.setMac(ByteArray.toHexString(extMac));
    }

    if (seedCipherText != null) {
      crypto.setSeedciphertext(ByteArray.toHexString(seedCipherText));
      WalletFile.CipherParams seedCipherParams = new WalletFile.CipherParams();
      seedCipherParams.setIv(ByteArray.toHexString(seedIv));
      crypto.setSeedcipherparams(seedCipherParams);
      crypto.setSeedmac(ByteArray.toHexString(seedMac));
    }

    crypto.setKdf(SCRYPT);
    WalletFile.ScryptKdfParams kdfParams = new WalletFile.ScryptKdfParams();
    kdfParams.setDklen(DKLEN);
    kdfParams.setN(n);
    kdfParams.setP(p);
    kdfParams.setR(R);
    kdfParams.setSalt(ByteArray.toHexString(salt));
    crypto.setKdfparams(kdfParams);

    walletFile.setCrypto(crypto);
    walletFile.setId(UUID.randomUUID().toString());
    walletFile.setVersion(CURRENT_VERSION);
    return walletFile;
  }

  // Reconstructs a PQSignature from whichever segments are persisted. When both
  // are present the seed↔ext consistency check guards against insider tamper
  // (an attacker who knows the password and rewrites only the seed segment to
  // point at a different keypair would still produce the *wrong* derived
  // public key). The address consistency check defends against an attacker who
  // rewrites the cleartext `address` field.
  public static PQSignature decryptPQ(byte[] password, WalletFile walletFile)
      throws CipherException {
    PQKeyMaterial material = verifyAndDecryptPQ(password, walletFile);
    try {
      // The signer holds its own copy of the key material, so it stays valid
      // after the raw plaintext buffers are zeroed below.
      return material.signer;
    } finally {
      material.clearSecrets();
    }
  }

  // Re-encrypts a PQ keystore under a new password while preserving the
  // original segment shape: whichever of {ext, seed} were persisted are
  // re-encrypted; the other stays absent. Scrypt parameters are re-derived
  // from the wallet's existing kdf params (so callers cannot inadvertently
  // downgrade N/p by passing wrong flags). Address and scheme are preserved.
  // Throws if either MAC mismatches the old password or the persisted segments
  // disagree on the keypair.
  public static WalletFile reEncryptPQ(byte[] oldPassword, byte[] newPassword,
      WalletFile walletFile) throws CipherException {
    PQKeyMaterial material = verifyAndDecryptPQ(oldPassword, walletFile);
    try {
      // verifyAndDecryptPQ derives the key via deriveScryptKey, which rejects
      // any non-scrypt KDF, so the kdf params are guaranteed scrypt here.
      WalletFile.ScryptKdfParams kdf =
          (WalletFile.ScryptKdfParams) walletFile.getCrypto().getKdfparams();
      WalletFile reEncrypted = createPQ(newPassword, material.scheme,
          material.extended, material.seed, material.signer.getPublicKey(),
          kdf.getN(), kdf.getP());
      reEncrypted.setId(walletFile.getId());
      reEncrypted.setName(walletFile.getName());
      return reEncrypted;
    } finally {
      material.clearSecrets();
    }
  }

  // Recovered secret material from a PQ keystore. The reconstructed signer
  // holds its own copy of the key, so zeroing these raw buffers via
  // clearSecrets() does not invalidate a returned signer.
  private static final class PQKeyMaterial {
    final PQScheme scheme;
    final PQSignature signer;
    final byte[] extended; // plaintext persisted private key, or null
    final byte[] seed;     // plaintext keygen seed, or null

    PQKeyMaterial(PQScheme scheme, PQSignature signer, byte[] extended, byte[] seed) {
      this.scheme = scheme;
      this.signer = signer;
      this.extended = extended;
      this.seed = seed;
    }

    void clearSecrets() {
      if (extended != null) {
        StringUtils.clear(extended);
      }
      if (seed != null) {
        StringUtils.clear(seed);
      }
    }
  }

  // Password-validation-only path for PQ keystores. Verifies MACs (and
  // structural invariants) without decrypting any key material or constructing
  // a signer, so no private-key bytes leak into heap. Used by validPassword to
  // avoid the signer-retention issue of the full verifyAndDecryptPQ path.
  private static boolean validatePasswordPQ(byte[] password, WalletFile walletFile)
      throws CipherException {
    if (walletFile.getScheme() == null) {
      throw new CipherException("Wallet has no PQ scheme tag");
    }
    final PQScheme scheme;
    try {
      scheme = PQScheme.valueOf(walletFile.getScheme());
    } catch (IllegalArgumentException e) {
      throw new CipherException("Unsupported PQ scheme: " + walletFile.getScheme(), e);
    }
    if (!PQSchemeRegistry.contains(scheme)) {
      throw new CipherException("Unsupported PQ scheme: " + scheme);
    }

    validate(walletFile);
    WalletFile.Crypto crypto = walletFile.getCrypto();

    boolean extPresent = isExtSegmentPresent(crypto);
    boolean seedPresent = isSeedSegmentPresent(crypto);
    requireSegmentShape(crypto, extPresent, seedPresent);
    if (!extPresent && !seedPresent) {
      throw new CipherException(
          "PQ wallet has neither ciphertext nor seedciphertext");
    }

    byte[] derivedKey = deriveScryptKey(password, crypto);
    try {
      if (extPresent) {
        byte[] extCipherText = ByteArray.fromHexString(crypto.getCiphertext());
        byte[] storedMac = ByteArray.fromHexString(crypto.getMac());
        if (!Arrays.equals(generateMac(derivedKey, extCipherText), storedMac)) {
          throw new CipherException("Invalid password provided");
        }
      }
      if (seedPresent) {
        byte[] seedCipherText = ByteArray.fromHexString(crypto.getSeedciphertext());
        byte[] storedMac = ByteArray.fromHexString(crypto.getSeedmac());
        if (!Arrays.equals(generateMac(derivedKey, seedCipherText), storedMac)) {
          throw new CipherException("Invalid password provided");
        }
      }
      return true;
    } finally {
      StringUtils.clear(derivedKey);
    }
  }

  // Shared decrypt-and-verify core for PQ keystores, used by both decryptPQ and
  // reEncryptPQ so the security checks cannot drift between them. Resolves and
  // validates the scheme, verifies every persisted segment's MAC under
  // `password` BEFORE decrypting any segment, enforces the independent-IV and
  // seed↔ext consistency invariants, reconstructs the keypair, and checks the
  // recovered address against the keystore's cleartext `address` field.
  //
  // Returns the reconstructed signer together with the raw plaintext segments.
  // The caller owns the returned secrets and MUST call clearSecrets() once done
  // (on any failure this method clears them before throwing).
  private static PQKeyMaterial verifyAndDecryptPQ(byte[] password, WalletFile walletFile)
      throws CipherException {
    if (walletFile.getScheme() == null) {
      throw new CipherException("Wallet has no PQ scheme tag");
    }
    final PQScheme scheme;
    try {
      scheme = PQScheme.valueOf(walletFile.getScheme());
    } catch (IllegalArgumentException e) {
      throw new CipherException("Unsupported PQ scheme: " + walletFile.getScheme(), e);
    }
    if (!PQSchemeRegistry.contains(scheme)) {
      throw new CipherException("Unsupported PQ scheme: " + scheme);
    }
    int expectedSeedLen = PQSchemeRegistry.getSeedLength(scheme);

    validate(walletFile);
    WalletFile.Crypto crypto = walletFile.getCrypto();

    boolean extPresent = isExtSegmentPresent(crypto);
    boolean seedPresent = isSeedSegmentPresent(crypto);
    requireSegmentShape(crypto, extPresent, seedPresent);
    if (!extPresent && !seedPresent) {
      throw new CipherException(
          "PQ wallet has neither ciphertext nor seedciphertext");
    }

    byte[] derivedKey = deriveScryptKey(password, crypto);
    byte[] encryptKey = Arrays.copyOfRange(derivedKey, 0, 16);
    byte[] extended = null;
    byte[] seedBytes = null;
    try {
      // Verify every MAC that is present before decrypting any segment so a
      // partial-tamper attack cannot produce a half-valid keypair.
      byte[] extCipherText = null;
      byte[] seedCipherText = null;
      if (extPresent) {
        extCipherText = ByteArray.fromHexString(crypto.getCiphertext());
        byte[] storedMac = ByteArray.fromHexString(crypto.getMac());
        if (!Arrays.equals(generateMac(derivedKey, extCipherText), storedMac)) {
          throw new CipherException("Invalid password provided");
        }
      }
      if (seedPresent) {
        seedCipherText = ByteArray.fromHexString(crypto.getSeedciphertext());
        byte[] storedMac = ByteArray.fromHexString(crypto.getSeedmac());
        if (!Arrays.equals(generateMac(derivedKey, seedCipherText), storedMac)) {
          throw new CipherException("Invalid password provided");
        }
      }

      byte[] extIv = extPresent
          ? ByteArray.fromHexString(crypto.getCipherparams().getIv()) : null;
      byte[] seedIv = seedPresent
          ? ByteArray.fromHexString(crypto.getSeedcipherparams().getIv()) : null;
      if (extIv != null && seedIv != null && Arrays.equals(extIv, seedIv)) {
        throw new CipherException("PQ keystore reuses IV across ext/seed segments");
      }

      PQSignature signer;
      if (extPresent) {
        extended = performCipherOperation(Cipher.DECRYPT_MODE, extIv, encryptKey,
            extCipherText);
        signer = PQSchemeRegistry.fromPersistedPrivateKey(scheme, extended);
        if (seedPresent) {
          seedBytes = performCipherOperation(Cipher.DECRYPT_MODE, seedIv, encryptKey,
              seedCipherText);
          if (seedBytes.length != expectedSeedLen) {
            throw new CipherException(
                "Decrypted seed has unexpected length: " + seedBytes.length);
          }
          // Cross-check: re-deriving from the seed must reproduce the same
          // public key. Mismatch means seed and ext disagree (insider tamper
          // or corruption); reject rather than silently preferring one.
          PQSignature seedDerived = PQSchemeRegistry.fromSeed(scheme, seedBytes);
          if (!Arrays.equals(seedDerived.getPublicKey(), signer.getPublicKey())) {
            throw new CipherException(
                "PQ keystore seed and extended private key disagree");
          }
        }
      } else {
        seedBytes = performCipherOperation(Cipher.DECRYPT_MODE, seedIv, encryptKey,
            seedCipherText);
        if (seedBytes.length != expectedSeedLen) {
          throw new CipherException(
              "Decrypted seed has unexpected length: " + seedBytes.length);
        }
        signer = PQSchemeRegistry.fromSeed(scheme, seedBytes);
      }

      // Address consistency: the cleartext `address` field is unauthenticated.
      // Reject any keystore whose stored address does not match the address
      // derived from the reconstructed public key.
      String derivedAddress = WalletApi.encode58Check(
          PQSchemeRegistry.computeAddress(scheme, signer.getPublicKey()));
      if (walletFile.getAddress() != null
          && !derivedAddress.equals(walletFile.getAddress())) {
        throw new CipherException(
            "PQ keystore address does not match the decrypted public key");
      }

      return new PQKeyMaterial(scheme, signer, extended, seedBytes);
    } catch (CipherException | RuntimeException e) {
      // Decryption may have produced plaintext secrets before a later check
      // failed; zero them before propagating so they never outlive this call.
      if (extended != null) {
        StringUtils.clear(extended);
      }
      if (seedBytes != null) {
        StringUtils.clear(seedBytes);
      }
      throw e;
    } finally {
      StringUtils.clear(encryptKey);
      StringUtils.clear(derivedKey);
    }
  }

  private static boolean isExtSegmentPresent(WalletFile.Crypto crypto) {
    return crypto.getCiphertext() != null
        || crypto.getCipherparams() != null
        || crypto.getMac() != null;
  }

  private static boolean isSeedSegmentPresent(WalletFile.Crypto crypto) {
    return crypto.getSeedciphertext() != null
        || crypto.getSeedcipherparams() != null
        || crypto.getSeedmac() != null;
  }

  private static void requireSegmentShape(WalletFile.Crypto crypto,
      boolean extPresent, boolean seedPresent) throws CipherException {
    if (extPresent
        && (crypto.getCiphertext() == null
            || crypto.getCipherparams() == null
            || crypto.getCipherparams().getIv() == null
            || crypto.getMac() == null)) {
      throw new CipherException(
          "PQ keystore extended-key segment is incomplete");
    }
    if (seedPresent
        && (crypto.getSeedciphertext() == null
            || crypto.getSeedcipherparams() == null
            || crypto.getSeedcipherparams().getIv() == null
            || crypto.getSeedmac() == null)) {
      throw new CipherException(
          "PQ keystore seed segment is incomplete");
    }
  }

  private static byte[] deriveScryptKey(byte[] password, WalletFile.Crypto crypto)
      throws CipherException {
    WalletFile.KdfParams kdfParams = crypto.getKdfparams();
    if (kdfParams instanceof WalletFile.ScryptKdfParams) {
      WalletFile.ScryptKdfParams scryptKdfParams = (WalletFile.ScryptKdfParams) kdfParams;
      byte[] salt = ByteArray.fromHexString(scryptKdfParams.getSalt());
      return generateDerivedScryptKey(password, salt,
          scryptKdfParams.getN(), scryptKdfParams.getR(),
          scryptKdfParams.getP(), scryptKdfParams.getDklen());
    }
    throw new CipherException("PQ wallets must use scrypt KDF");
  }

  static void validate(WalletFile walletFile) throws CipherException {
    WalletFile.Crypto crypto = walletFile.getCrypto();

    if (walletFile.getVersion() != CURRENT_VERSION) {
      throw new CipherException("Wallet version is not supported");
    }

    if (!crypto.getCipher().equals(CIPHER)) {
      throw new CipherException("Wallet cipher is not supported");
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
