package org.tron.core.converter;

import static org.tron.common.crypto.ECKey.fromPrivate;
import static org.tron.common.crypto.ECKey.fromPublicOnly;
import static org.tron.trident.core.utils.Utils.decodeFromBase58Check;
import static org.tron.trident.core.utils.Utils.encode58Check;

import java.util.Arrays;
import java.util.Base64;
import java.util.Scanner;
import org.bouncycastle.util.encoders.Hex;
import org.tron.common.crypto.ECKey;

public class EncodingConverter {
  private static final Scanner scanner = new Scanner(System.in);

  public static void runCLI() {
    while (true) {
      printMenu();
      String cmd = scanner.nextLine().trim();

      switch (cmd) {
        case "1":
          tronEvmMenu();
          break;
        case "2":
          base64Menu();
          break;
        case "3":
          base58Menu();
          break;
        case "4":
          pubKeyMenu();
          break;
        case "5":
          priKeyMenu();
          break;
        case "0":
          System.out.println("Bye.");
          return;
        default:
          System.out.println("Invalid option\n");
      }
    }
  }

  private static void printMenu() {
    System.out.println("\n==============================");
    System.out.println("  Encoding Converter (CLI)");
    System.out.println("==============================");
    System.out.println("1) TRON - EVM Address");
    System.out.println("2) Base64 Encode / Decode");
    System.out.println("3) Base58Check Encode / Decode");
    System.out.println("4) Public Key -> Address");
    System.out.println("5) Private Key -> Public Key & Address");
    System.out.println("0) Exit");
    System.out.print("> ");
  }

  private static void tronEvmMenu() {
    System.out.println("\n1) TRON -> EVM");
    System.out.println("2) EVM -> TRON");
    System.out.print("> ");
    String opt = scanner.nextLine();

    System.out.println("Input (one per line, empty line to end):");
    while (true) {
      String line = scanner.nextLine().trim();
      if (line.isEmpty()) break;

      try {
        if ("1".equals(opt)) {
          byte[] address = decodeFromBase58Check(line);
          System.out.println(" (EVM) Address: " + tronByteToEvm(address));
        } else {
          System.out.println("TRON Address:" + evmToTron(line));
        }
      } catch (Exception e) {
        System.out.println("Input is invalid.");
      }
    }
  }

  private static void base64Menu() {
    System.out.println("\n1) Encode (Hex -> Base64)");
    System.out.println("2) Decode (Base64 -> Hex)");
    System.out.print("> ");
    String opt = scanner.nextLine();

    System.out.println("Input (one per line, empty line to end):");
    while (true) {
      String line = scanner.nextLine().trim();
      if (line.isEmpty() || "c".equals(line)) break;

      try {
        if ("1".equals(opt)) {
          System.out.println(hexToBase64(line));
        } else {
          System.out.println(base64ToHex(line));
        }
      } catch (Exception e) {
        System.out.println("Input is invalid.");
      }
    }
  }

  public static String hexToBase64(String hex) {
    byte[] bytes = Hex.decode(hex);
    return Base64.getEncoder().encodeToString(bytes);
  }

  public static String base64ToHex(String base64) {
    byte[] bytes = Base64.getDecoder().decode(base64);
    return Hex.toHexString(bytes);
  }

  public static String hexToBase58(String hex) {
    byte[] bytes = Hex.decode(hex);
    return encode58Check(bytes);
  }

  public static String base58ToHex(String base64) {
    byte[] bytes = decodeFromBase58Check(base64);
    return Hex.toHexString(bytes);
  }

  public static String tronByteToEvm(byte[] tronAddress) {
    return "0x" + Hex.toHexString(Arrays.copyOfRange(tronAddress, 1, tronAddress.length));
  }

  public static String evmToTron(String evmAddress) {
    if (evmAddress.startsWith("0x")) {
      evmAddress = evmAddress.substring(2);
    }

    byte[] evm = Hex.decode(evmAddress); // 20 bytes
    byte[] tron = new byte[21];

    tron[0] = 0x41;
    System.arraycopy(evm, 0, tron, 1, 20);

    return encode58Check(tron);
  }

  private static void base58Menu() {
    System.out.println("\n1) Encode (Hex -> Base58Check)");
    System.out.println("2) Decode (Base58Check -> Hex)");
    System.out.print("Select > ");
    String opt = scanner.nextLine();

    System.out.println("Input (one per line, empty line to end):");
    while (true) {
      String line = scanner.nextLine().trim();
      if (line.isEmpty()) break;

      try {
        if ("1".equals(opt)) {
          System.out.println(hexToBase58((line)));
        } else {
          System.out.println(base58ToHex(line));
        }
      } catch (Exception e) {
        System.out.println("Input is invalid.");
      }
    }
  }

  private static void pubKeyMenu() {
    System.out.println("\nInput public key hex (empty to end):");
    while (true) {
      String line = scanner.nextLine().trim();
      if (line.isEmpty()) break;

      try {
        byte[] pub = Hex.decode(line);
        ECKey ecKey = fromPublicOnly(pub);
        byte[] address = ecKey.getAddress();
        System.out.println("Address (Base58Check): " + encode58Check(address));
        System.out.println("Address (EVM): " + tronByteToEvm(address));
        System.out.println("Address (Hex String): " + Hex.toHexString(address));
      } catch (Exception e) {
        System.out.println("Input is invalid.");
      }
    }
  }

  private static void priKeyMenu() {
    System.out.println("\nInput private key hex (empty to end):");
    while (true) {
      String line = scanner.nextLine().trim();
      if (line.isEmpty()) break;

      try {
        byte[] pri = Hex.decode(line);
        ECKey ecKey = fromPrivate(pri);
        byte[] address = ecKey.getAddress();
        System.out.println("Public Key: " + Hex.toHexString(ecKey.getPubKey()));
        System.out.println();
        System.out.println("Address (Base58Check): " + encode58Check(address));
        System.out.println("Address (EVM): " + tronByteToEvm(address));
        System.out.println("Address (Hex String): " + Hex.toHexString(address));
      } catch (Exception e) {
        System.out.println("Input is invalid.");
      }
    }
  }
}
