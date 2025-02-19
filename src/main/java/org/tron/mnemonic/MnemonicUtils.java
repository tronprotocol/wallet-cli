package org.tron.mnemonic;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jline.reader.LineReader;
import org.jline.reader.LineReaderBuilder;
import org.jline.terminal.Terminal;
import org.jline.terminal.TerminalBuilder;
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

public class MnemonicUtils {
  private static final String FilePath = "Mnemonic";
  private static final int MNEMONIC_WORDS_LENGTH_12 = 12;
  private static final int MNEMONIC_WORDS_LENGTH_24 = 24;
  private static final int INVALID_INPUT_LENGTH = 0;
  private static final String MNEMONIC_WORDS_LENGTH_12_STR = "12";
  private static final String MNEMONIC_WORDS_LENGTH_24_STR = "24";
  private static final int ENTROPY_LENGTH_12_WORDS = 16; // 128 bit
  private static final int ENTROPY_LENGTH_24_WORDS = 32; // 256 bit

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
    try {
      Terminal terminal = TerminalBuilder.builder().system(true).build();
      LineReader lineReader = LineReaderBuilder.builder().terminal(terminal).build();
      int attempts = 0;
      final int maxAttempts = 3;

      while (attempts < maxAttempts) {
        String prompt = "Please enter the number of mnemonic words \n" +
            "\tDefault: 12 mnemonic words, \n" +
            "\tEnter 24 to use 24 mnemonic words\n" +
            "\tPress Enter to use the default (12). \n" +
            "\tValid inputs are \"12\" or \"24\")\n\n";
        String input = lineReader.readLine(prompt).trim();
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

}
