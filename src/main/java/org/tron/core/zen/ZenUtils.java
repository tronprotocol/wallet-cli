package org.tron.core.zen;

import org.tron.core.exception.CipherException;

import javax.crypto.BadPaddingException;
import javax.crypto.Cipher;
import javax.crypto.IllegalBlockSizeException;
import javax.crypto.NoSuchPaddingException;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.*;
import java.nio.charset.Charset;
import java.security.InvalidAlgorithmParameterException;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class ZenUtils {

  public static List<String> getListFromFile(final String fileName ) {
    List<String> list = new ArrayList<>();
    try {
      FileInputStream inputStream = new FileInputStream(fileName);
      BufferedReader bufferedReader = new BufferedReader(new InputStreamReader(inputStream));

      String str = null;
      while((str = bufferedReader.readLine()) != null)
      {
//        System.out.println(str);
        list.add(str);
      }
      inputStream.close();
      bufferedReader.close();
    } catch (Exception e) {
      if (e.getMessage() != null) {
        System.out.println(e.getMessage());
      } else {
        System.out.println(e.getClass());
      }
    }
    return list;
  }

  public static boolean appendToFileTail(final String fileName, final String content) {
    BufferedWriter out = null;
    try {
      out = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(fileName, true)));
      out.write(content+"\n");
      out.flush();
    } catch (Exception e) {
      e.printStackTrace();
    } finally {
      try {
        out.close();
      } catch (IOException e) {
        e.printStackTrace();
      }
    }
    return true;
  }

  public static void clearFile(String fileName) {
    File file = new File(fileName);
    try {
      if (file.exists()) {
        FileWriter fileWriter = new FileWriter(file);
        fileWriter.write("");
        fileWriter.flush();
        fileWriter.close();
      }
    } catch (Exception e) {
      e.printStackTrace();
    }
  }

  public static void checkFolderExist(final String filePath) {
    try {
      File file = new File(filePath);
      if (file.exists()) {
        if (file.isDirectory()) {
          return;
        } else {
          file.delete();
        }
      }
      file.mkdir();
    } catch (Exception e) {
      e.printStackTrace();
    }
  }

  public static void checkFoldersExist(final String filePath) {
    try {
      File file = new File(filePath);
      if (file.exists()) {
        if (file.isDirectory()) {
          return;
        } else {
          file.delete();
        }
      }
      file.mkdirs();
    } catch (Exception e) {
      e.printStackTrace();
    }
  }

  public static boolean checkFileExist(final String filePath) {
    try {
      File file = new File(filePath);
      if (file.exists() && !file.isDirectory()) {
        return true;
      } else {
        return false;
      }
    } catch (Exception e) {
      e.printStackTrace();
    }
    return false;
  }

  public static String getMemo(byte[] memo) {
    int index = memo.length;
    for (; index>0; --index) {
      if (memo[index-1] != 0)
        break;
    }

    byte[] inputCheck = new byte[index];
    System.arraycopy(memo, 0, inputCheck, 0, index);
    return new String(inputCheck, Charset.forName("UTF-8"));
  }


  public static byte[] aesCtrEncrypt(byte[] text, byte[] encryptKey) throws CipherException {
    try {
      byte[] iv = new byte[16];
      new SecureRandom().nextBytes(iv);
      IvParameterSpec ivParameterSpec = new IvParameterSpec(iv);
      Cipher cipher = Cipher.getInstance("AES/CTR/NoPadding");

      SecretKeySpec secretKeySpec = new SecretKeySpec(encryptKey, "AES");
      cipher.init(Cipher.ENCRYPT_MODE, secretKeySpec, ivParameterSpec);
      byte[] cipherText = cipher.doFinal(text);
      byte[] result = new byte[cipherText.length + iv.length];
      System.arraycopy(iv, 0, result, 0, iv.length);
      System.arraycopy(cipherText, 0, result, iv.length, cipherText.length);
      return result;
    } catch (NoSuchPaddingException | NoSuchAlgorithmException
            | InvalidAlgorithmParameterException | InvalidKeyException
            | BadPaddingException | IllegalBlockSizeException e) {
      throw new CipherException("Error performing cipher operation", e);
    }
  }

  public static byte[] aesCtrDecrypt(byte[] cipherText, byte[] encryptKey) throws CipherException {
    try {
      byte[] iv = Arrays.copyOfRange(cipherText, 0, 16);
      cipherText = Arrays.copyOfRange(cipherText, iv.length, cipherText.length);

      IvParameterSpec ivParameterSpec = new IvParameterSpec(iv);
      Cipher cipher = Cipher.getInstance("AES/CTR/NoPadding");

      SecretKeySpec secretKeySpec = new SecretKeySpec(encryptKey, "AES");
      cipher.init(Cipher.DECRYPT_MODE, secretKeySpec, ivParameterSpec);
      return cipher.doFinal(cipherText);
    } catch (NoSuchPaddingException | NoSuchAlgorithmException
            | InvalidAlgorithmParameterException | InvalidKeyException
            | BadPaddingException | IllegalBlockSizeException e) {
      throw new CipherException("Error performing cipher operation", e);
    }
  }
}
