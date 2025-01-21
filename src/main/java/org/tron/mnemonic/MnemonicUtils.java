package org.tron.mnemonic;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    DateTimeFormatter format = DateTimeFormatter.ofPattern(
        "'UTC--'yyyy-MM-dd'T'HH-mm-ss.nVV'--'");
    ZonedDateTime now = ZonedDateTime.now(ZoneOffset.UTC);

    return now.format(format) + mnemonicFile.getAddress() + ".json";
  }

  public static byte[] exportMnemonic(byte[] password, File file, String address) throws IOException, CipherException {
    if (!file.exists()) {
      System.out.println("mnemonic file not exist");
      System.out.println("Please use ImportWalletByMnemonic to import the wallet or RegisterWallet to create a new wallet.");
      return new byte[0];
    }
    MnemonicFile mnemonicFile = objectMapper.readValue(file, MnemonicFile.class);
    if (!mnemonicFile.getAddress().equals(address)) {
      System.out.println("You can't export the mnemonic of other addresses: " + address);
      return new byte[0];
    }
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
}
