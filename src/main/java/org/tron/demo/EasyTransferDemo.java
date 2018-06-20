package org.tron.demo;

import com.google.protobuf.Any;
import com.google.protobuf.ByteString;
import com.google.protobuf.InvalidProtocolBufferException;
import java.util.Arrays;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.Sha256Hash;
import org.tron.common.utils.ByteArray;
import org.tron.protos.Contract;
import org.tron.protos.Protocol.Block;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.WalletClient;

public class EasyTransferDemo {

  public static void main(String[] args) throws InvalidProtocolBufferException {
    String passPhrase = "test pass phrase";
    byte[] address = WalletClient.createAdresss(passPhrase.getBytes());
  }
}
