package org.tron.mnemonic;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jline.reader.LineReader;
import org.jline.reader.LineReaderBuilder;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;
import org.apache.commons.lang3.ArrayUtils;
import org.tron.common.crypto.SignInterface;
import org.tron.common.utils.ByteArray;
import org.tron.core.exception.CipherException;
import org.web3j.crypto.Bip32ECKeyPair;
import org.web3j.crypto.Credentials;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
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
  private static final int MNEMONIC_WORDS_LENGTH_12 = 12;
  private static final int MNEMONIC_WORDS_LENGTH_24 = 24;
  private static final int INVALID_INPUT_LENGTH = 0;
  private static final String MNEMONIC_WORDS_LENGTH_12_STR = "12";
  private static final String MNEMONIC_WORDS_LENGTH_24_STR = "24";
  private static final int ENTROPY_LENGTH_12_WORDS = 16; // 128 bit
  private static final int ENTROPY_LENGTH_24_WORDS = 32; // 256 bit
  private static final Pattern NUMBER_PATTERN =
      Pattern.compile("m/(\\d+)'/(\\d+)'/(\\d+)'/(\\d+)/(\\d+)");

  private static final ObjectMapper objectMapper = new ObjectMapper();

  static {
    objectMapper.configure(JsonParser.Feature.ALLOW_UNQUOTED_FIELD_NAMES, true);
    objectMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
  }

  public static List<String> generateMnemonic(SecureRandom secureRandom, int wordsNumber) {
    int entropyLength =
        (wordsNumber == MNEMONIC_WORDS_LENGTH_12) ? ENTROPY_LENGTH_12_WORDS : ENTROPY_LENGTH_24_WORDS;
    byte[] entropy = new byte[entropyLength];
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

  public static int inputMnemonicWordsNumber() {
    int attempts = 0;
    final int maxAttempts = 3;

    try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in))) {
      while (attempts < maxAttempts) {
        String prompt = "Please enter the number of mnemonic words \n" +
            "\tDefault: 12 mnemonic words, \n" +
            "\tEnter 24 to use 24 mnemonic words\n" +
            "\tPress Enter to use the default (12). \n" +
            "\tValid inputs are \"12\" or \"24\"\n";
        System.out.print(prompt);
        String input = reader.readLine().trim();
        if (input.isEmpty() || MNEMONIC_WORDS_LENGTH_12_STR.equals(input)) {
          return MNEMONIC_WORDS_LENGTH_12;
        } else if (MNEMONIC_WORDS_LENGTH_24_STR.equals(input)) {
          return MNEMONIC_WORDS_LENGTH_24;
        } else {
          attempts++;
          System.out.println("Invalid input\n"
              + "Please ensure that the value entered is valid (12 or 24).\n" +
              "You have " + (maxAttempts - attempts) + " attempts left\n");
        }
      }
      return INVALID_INPUT_LENGTH;
    } catch (Exception e) {
      System.err.println("Input error: " + e.getMessage() + "\n" +
          "Please ensure that the value entered is valid (12 or 24)");
      return INVALID_INPUT_LENGTH;
    }
  }
  public static boolean inputMnemonicWordsNumberCheck(int wordsNumber) {
    return wordsNumber == MNEMONIC_WORDS_LENGTH_12 || wordsNumber == MNEMONIC_WORDS_LENGTH_24;
  }

  // path = m/44'/195'/0'/0/0
  public static byte[] getPrivateKeyFromMnemonicByPath(List<String> mnemonics, int pathIndex) {
    if (mnemonics == null || mnemonics.isEmpty()) {
      throw new IllegalArgumentException("Mnemonics cannot be null or empty");
    }
    if (pathIndex < 0) {
      throw new IllegalArgumentException("Path index cannot be negative");
    }
    int HARDENED_BIT = 0x80000000;
    String mnemonic = String.join(" ", mnemonics);
    try {
      byte[] seed = org.web3j.crypto.MnemonicUtils.generateSeed(mnemonic, "");
      Bip32ECKeyPair masterKeypair = Bip32ECKeyPair.generateKeyPair(seed);
      // m/44'/195'/0'/0/0
      final int[] path = {44 | HARDENED_BIT, 195 | HARDENED_BIT, 0 | HARDENED_BIT, 0, pathIndex};
      Bip32ECKeyPair bip44Keypair = Bip32ECKeyPair.deriveKeyPair(masterKeypair, path);
      Credentials credentials = Credentials.create(bip44Keypair);
      String privateKey = credentials.getEcKeyPair().getPrivateKey().toString(16);

      return ByteArray.fromHexString(privateKey);
    } catch (Exception e) {
      throw new RuntimeException("Failed to derive private key from mnemonic", e);
    }
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
      throw new IllegalArgumentException("Invalid path format: " + pathFull);
    }
    if (pathNumer[0] != 44 || pathNumer[1] != 195 || pathNumer[3] != 0) {
      throw new IllegalArgumentException("Path does not match expected format: " + pathFull);
    }

    int HARDENED_BIT = 0x80000000;
    String mnemonic = String.join(" ", mnemonics);
    try {
      byte[] seed = org.web3j.crypto.MnemonicUtils.generateSeed(mnemonic, "");
      Bip32ECKeyPair masterKeypair = Bip32ECKeyPair.generateKeyPair(seed);
      // m/44'/195'/0'/0/0
      final int[] path = {44 | HARDENED_BIT, 195 | HARDENED_BIT, pathNumer[2] | HARDENED_BIT, 0, pathNumer[4]};
      Bip32ECKeyPair bip44Keypair = Bip32ECKeyPair.deriveKeyPair(masterKeypair, path);
      Credentials credentials = Credentials.create(bip44Keypair);
      String privateKey = credentials.getEcKeyPair().getPrivateKey().toString(16);

      return ByteArray.fromHexString(privateKey);
    } catch (Exception e) {
      throw new RuntimeException("Failed to derive private key from mnemonic", e);
    }
  }

  public static int[] extractNumbers(String path) {
    Matcher matcher = NUMBER_PATTERN.matcher(path);
    if (!matcher.matches()) {
      throw new IllegalArgumentException("Invalid path format: " + path);
    }
    int[] numbers = new int[5];
    try {
      for (int i = 0; i < 5; i++) {
        numbers[i] = Integer.parseInt(matcher.group(i + 1));
      }
    } catch (NumberFormatException e) {
      throw new IllegalArgumentException("Path contains non-numeric values: " + path, e);
    }

    return numbers;
  }

}
