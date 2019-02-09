package org.tron.demo;

import com.typesafe.config.Config;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import org.tron.common.crypto.ECKey;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.TransactionUtils;
import org.tron.common.utils.Utils;
import org.tron.core.config.Configuration;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.WalletApi;

public class OffLine {

  private static void genPrivateAddress(int num) throws IOException {
    long time = System.currentTimeMillis();
    File addressFile = new File(time + "address.txt");
    File keyFile = new File(time + "key.txt");
    FileOutputStream addressFOS = new FileOutputStream(addressFile);
    OutputStreamWriter addressOSW = new OutputStreamWriter(addressFOS);
    FileOutputStream keyFOS = new FileOutputStream(keyFile);
    OutputStreamWriter keyOSW = new OutputStreamWriter(keyFOS);
    try {
      for (int i = 0; i < num; i++) {
        ECKey eCkey = new ECKey(Utils.getRandom());  //Gen new Keypair
        byte[] address = eCkey.getAddress();
        String base58checkAddress = WalletApi.encode58Check(address);
        keyOSW.append((i + 1) + "\n");
        keyOSW.append(base58checkAddress + "\n");
        keyOSW.append(ByteArray.toHexString(eCkey.getPrivKeyBytes()) + "\n");
        addressOSW.append((i + 1) + "\n");
        addressOSW.append(base58checkAddress + "\n");
      }
    } catch (Exception e) {
      throw new IOException(e.getMessage());
    } finally {
      addressOSW.close();
      addressFOS.close();
      keyOSW.close();
      keyFOS.close();
    }
  }

  private static void signTransaction(byte[] privateKey) throws IOException {
    File transactionSignedFile = new File("transactionSigned.txt");
    File transactionFile = new File("transaction.txt");
    FileInputStream inputStream = null;
    InputStreamReader inputStreamReader = null;
    BufferedReader bufferedReader = null;
    FileOutputStream outputStream = null;
    OutputStreamWriter outputStreamWriter = null;
    ECKey ecKey = ECKey.fromPrivate(privateKey);
    try {
      inputStream = new FileInputStream(transactionFile);
      inputStreamReader = new InputStreamReader(inputStream);
      bufferedReader = new BufferedReader(inputStreamReader);

      outputStream = new FileOutputStream(transactionSignedFile);
      outputStreamWriter = new OutputStreamWriter(outputStream);

      String transaction;
      String number;
      while ((number = bufferedReader.readLine()) != null) {
        transaction = bufferedReader.readLine();
        Transaction transaction1 = Transaction.parseFrom(ByteArray.fromHexString(transaction));
        transaction1 = TransactionUtils.setTimestamp(transaction1);
        transaction1 = TransactionUtils.sign(transaction1, ecKey);
        outputStreamWriter.append(number + "\n");
        outputStreamWriter.append(ByteArray.toHexString(transaction1.toByteArray()) + "\n");
      }
    } catch (IOException e) {
      throw e;
    } finally {
      if (bufferedReader != null) {
        bufferedReader.close();
      }
      if (inputStreamReader != null) {
        inputStreamReader.close();

      }
      if (inputStream != null) {
        inputStream.close();
      }
      if (outputStreamWriter != null) {
        outputStreamWriter.close();
      }
      if (outputStream != null) {
        outputStream.close();
      }
    }
  }

  public static void main(String[] args) throws IOException {
    Config config = Configuration.getByPath("config-off.conf");
    for (String arg : args) {
      System.out.println(arg);
    }
    if (args[0].equals("gen")) {
      int keyNumber;
      if (config.hasPath("KeyNum")) {
        String keyNum = config.getString("KeyNum");
        keyNumber = Integer.parseInt(keyNum);
      } else {
        keyNumber = 300;
      }
      genPrivateAddress(keyNumber);
      return;
    }

    if (args[0].equals("sign")) {
      byte[] privateKey;
      if (config.hasPath("privateKey")) {
        String priKey = config.getString("privateKey");
        privateKey = ByteArray.fromHexString(priKey);
        signTransaction(privateKey);
      }
      return;
    }
  }
}
