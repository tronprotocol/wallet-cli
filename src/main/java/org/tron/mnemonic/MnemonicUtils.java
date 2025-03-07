package org.tron.mnemonic;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.commons.lang3.ArrayUtils;
import org.tron.common.crypto.SignInterface;
import org.tron.common.utils.ByteArray;
import org.tron.core.exception.CipherException;
import org.web3j.crypto.Bip32ECKeyPair;
import org.web3j.crypto.Credentials;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.SecureRandom;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MnemonicUtils {
  private static final String FilePath = "Mnemonic";
  private static final ObjectMapper objectMapper = new ObjectMapper();

  static {
    objectMapper.configure(JsonParser.Feature.ALLOW_UNQUOTED_FIELD_NAMES, true);
    objectMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
  }

  public static List<String> generateMnemonic(SecureRandom secureRandom) {
    byte[] entropy = new byte[16];
    secureRandom.nextBytes(entropy);
    String mnemonicStr = org.web3j.crypto.MnemonicUtils.generateMnemonic(entropy);
    return stringToMnemonicWords(mnemonicStr);
  }

  public static String mnemonicWordsToString(List<String> mnemonicWords) {
    if (mnemonicWords == null || mnemonicWords.isEmpty()) {
      return "";
    }
    return String.join(" ", mnemonicWords);
  }

  public static List<String> stringToMnemonicWords(String mnemonicString) {
    if (mnemonicString == null || mnemonicString.trim().isEmpty()) {
      return new ArrayList<>();
    }
    return Arrays.asList(mnemonicString.trim().split("\\s+"));
  }

  public static String store2Keystore(MnemonicFile mnemonicFile) throws IOException {
    if (mnemonicFile == null) {
      System.out.println("Warning: Store mnemonic failed, mnemonicFile is null !!");
      return null;
    }
    File file = new File(FilePath);
    if (!file.exists()) {
      if (!file.mkdir()) {
        throw new IOException("Make directory failed!");
      }
    } else {
      if (!file.isDirectory()) {
        if (file.delete()) {
          if (!file.mkdir()) {
            throw new IOException("Make directory failed!");
          }
        } else {
          throw new IOException("File exists and can not be deleted!");
        }
      }
    }
    return generateWalletFile(mnemonicFile, file);
  }

  public static String generateWalletFile(MnemonicFile walletFile, File destinationDirectory)
      throws IOException {
    String fileName = getWalletFileName(walletFile);
    File destination = new File(destinationDirectory, fileName);

    objectMapper.writeValue(destination, walletFile);
    return fileName;
  }

  private static String getWalletFileName(MnemonicFile mnemonicFile) {
    return mnemonicFile.getAddress() + ".json";
  }

  public static byte[] exportMnemonic(byte[] password, String address)
      throws IOException, CipherException {
    File file = Paths.get("Mnemonic", address + ".json").toFile();
    if (!file.exists()) {
      System.out.println("mnemonic file not exist");
      System.out.println("Please use ImportWalletByMnemonic to " +
          "import the wallet or RegisterWallet to create a new wallet.");
      return new byte[0];
    }
    MnemonicFile mnemonicFile = objectMapper.readValue(file, MnemonicFile.class);
    return Mnemonic.decrypt2MnemonicWordsBytes(password, mnemonicFile);
  }

  public static byte[] getPrivateKeyFromMnemonic(List<String> mnemonics) {
    int HARDENED_BIT = 0x80000000;
    String mnemonic = String.join(" ", mnemonics);
    byte[] seed = org.web3j.crypto.MnemonicUtils.generateSeed(mnemonic, "");
    Bip32ECKeyPair masterKeypair = Bip32ECKeyPair.generateKeyPair(seed);
    // m/44'/195'/0'/0/0
    final int[] path = {44 | HARDENED_BIT, 195 | HARDENED_BIT, 0 | HARDENED_BIT, 0, 0};
    Bip32ECKeyPair bip44Keypair = Bip32ECKeyPair.deriveKeyPair(masterKeypair, path);
    Credentials credentials = Credentials.create(bip44Keypair);
    String privateKey = credentials.getEcKeyPair().getPrivateKey().toString(16);

    return ByteArray.fromHexString(privateKey);
  }

  public static byte[] getMnemonicBytes(byte[] password, File source)
      throws IOException, CipherException {
    MnemonicFile mnemonicFile = objectMapper.readValue(source, MnemonicFile.class);
    return Mnemonic.decrypt2MnemonicWordsBytes(password, mnemonicFile);
  }

  public static void updateMnemonicFile(
      byte[] password, SignInterface ecKeySm2Pair, File source,
      boolean useFullScrypt, List<String> mnemonics)
      throws CipherException, IOException {

    MnemonicFile mnemonicFile = objectMapper.readValue(source, MnemonicFile.class);
    if (useFullScrypt) {
      mnemonicFile = Mnemonic.createStandard(password, ecKeySm2Pair, mnemonics);
    } else {
      mnemonicFile = Mnemonic.createLight(password, ecKeySm2Pair, mnemonics);
    }

    objectMapper.writeValue(source, mnemonicFile);
  }

  // path = m/44'/195'/0'/0/0
  public static byte[] getPrivateKeyFromMnemonicByPath(List<String> mnemonics, int pathIndex) {
    int HARDENED_BIT = 0x80000000;
    String mnemonic = String.join(" ", mnemonics);
    byte[] seed = org.web3j.crypto.MnemonicUtils.generateSeed(mnemonic, "");
    Bip32ECKeyPair masterKeypair = Bip32ECKeyPair.generateKeyPair(seed);
    // m/44'/195'/0'/0/0
    final int[] path = {44 | HARDENED_BIT, 195 | HARDENED_BIT, 0 | HARDENED_BIT, 0, pathIndex};
    Bip32ECKeyPair bip44Keypair = Bip32ECKeyPair.deriveKeyPair(masterKeypair, path);
    Credentials credentials = Credentials.create(bip44Keypair);
    String privateKey = credentials.getEcKeyPair().getPrivateKey().toString(16);

    return ByteArray.fromHexString(privateKey);
  }

  public static String formatPathIndex2Path(int pathIndex) {
    return String.format("m/44'/195'/0'/0/%d", pathIndex);
  }

  public static boolean generatedAddress(String address) {
    File walletDir = new File("Wallet");
    if (!walletDir.exists() || !walletDir.isDirectory()) {
      return false;
    }

    File[] wallets = walletDir.listFiles();
    if (ArrayUtils.isEmpty(wallets)) {
      return false;
    }
    for (File wallet : wallets) {
      String fileName = wallet.getName();
      if (fileName.endsWith(".json") && fileName.contains(address)) {
        return true;
      }
    }
    return false;
  }

  public static byte[] getPrivateKeyFromMnemonicByCustomPath(List<String> mnemonics, String pathFull) {
    int[] pathNumer = extractNumbers(pathFull);
    if (pathNumer ==null) {
      return null;
    }
    if (pathNumer[0] != 44 || pathNumer[1] != 195 || pathNumer[3] != 0) {
      return null;
    }

    int HARDENED_BIT = 0x80000000;
    String mnemonic = String.join(" ", mnemonics);
    byte[] seed = org.web3j.crypto.MnemonicUtils.generateSeed(mnemonic, "");
    Bip32ECKeyPair masterKeypair = Bip32ECKeyPair.generateKeyPair(seed);
    // m/44'/195'/0'/0/0
    final int[] path = {44 | HARDENED_BIT, 195 | HARDENED_BIT, pathNumer[2] | HARDENED_BIT, 0, pathNumer[4]};
    Bip32ECKeyPair bip44Keypair = Bip32ECKeyPair.deriveKeyPair(masterKeypair, path);
    Credentials credentials = Credentials.create(bip44Keypair);
    String privateKey = credentials.getEcKeyPair().getPrivateKey().toString(16);

    return ByteArray.fromHexString(privateKey);
  }

  public static int[] extractNumbers(String path) {
    final Pattern NUMBER_PATTERN =
        Pattern.compile("m/(\\d+)'/(\\d+)'/(\\d+)'/(\\d+)/(\\d+)");
    Matcher matcher = NUMBER_PATTERN.matcher(path);
    if (!matcher.matches()) {
      return null;
    }
    int[] numbers = new int[5];
    for (int i = 0; i < 5; i++) {
      numbers[i] = Integer.parseInt(matcher.group(i + 1));
    }
    return numbers;
  }
}
