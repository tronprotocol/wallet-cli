/*
 * java-tron is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * java-tron is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

package org.tron.common.utils;

import static org.tron.common.crypto.Hash.sha256;

import com.google.protobuf.ByteString;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.ECKey.ECDSASignature;
import org.tron.protos.Protocal.TXInput;
import org.tron.protos.Protocal.Transaction;

public class TransactionUtils {

  private static final Logger logger = LoggerFactory.getLogger("Transaction");
  private final static int RESERVE_BALANCE = 10;

  /**
   * Obtain a data bytes after removing the id and SHA-256(data)
   *
   * @param transaction {@link Transaction} transaction
   * @return byte[] the hash of the transaction's data bytes which have no id
   */
  public static byte[] getHash(Transaction transaction) {
    Transaction.Builder tmp = transaction.toBuilder();
    //tmp.clearId();

    return sha256(tmp.build().toByteArray());
  }

  /**
   * Determine whether the transaction is a coinbase transaction
   *
   * @param transaction {@link Transaction} transaction
   * @return boolean true for coinbase, false for not coinbase
   */
  public static boolean isCoinbaseTransaction(Transaction transaction) {
    return  transaction.getRawData().getVinList().size() == 1 && transaction.getRawData().getVin(0).getRawData().getTxID().size() == 0 &&
            transaction.getRawData().getVin(0).getRawData().getVout() == -1;
   // return transaction.getVinList().size() == 1 && transaction.getVin(0)
      //  .getTxID().size() == 0 && transaction.getVin(0).getVout() == -1;
  }

  /*
   * 1. check hash
   * 2. check double spent
   * 3. check sign
   * 4. check balance
   */
  public static boolean validTransaction(Transaction signedTransaction) {
    if (TransactionUtils.isCoinbaseTransaction(signedTransaction)) {
      return true;
    }
    //1. check hash
   // ByteString idBS = signedTransaction.getRawData().getId(); //hash
    byte[] hash = TransactionUtils.getHash(signedTransaction);
    ByteString hashBS = ByteString.copyFrom(hash);
   // if (idBS == null || !idBS.equals(idBS)) {
     // return false;
    //}
    Transaction.Builder transactionBuilderSigned = signedTransaction.toBuilder();
    Transaction.Builder transactionBuilderBeforSign = signedTransaction.toBuilder();

    int inSize = signedTransaction.getRawData().getVinCount();
    //Clear all vin's signature and pubKey.
    for (int i = 0; i < inSize; i++) {
      TXInput vin = transactionBuilderBeforSign.getRawData().getVin(i);
      TXInput.Builder vinBuilder = vin.toBuilder();
      vinBuilder.clearSignature();
      vinBuilder.getRawDataBuilder().clearPubKey();
      vin = vinBuilder.build();
      transactionBuilderBeforSign.getRawDataBuilder().setVin(i, vin);
    }

    Transaction transactionBeforSign = transactionBuilderBeforSign.build();//No sign no pubkey
    for (int i = 0; i < inSize; i++) {
      transactionBuilderBeforSign = transactionBeforSign.toBuilder();
      TXInput vin = transactionBuilderBeforSign.getRawData().getVin(i);
      TXInput.Builder vinBuilder = vin.toBuilder();
      ByteString signBs = signedTransaction.getRawData().getVin(i).getSignature();
      byte[] signBA = signBs.toByteArray();
      ByteString pubKeyBs = signedTransaction.getRawData().getVin(i).getRawData().getPubKey();
      byte[] pubKeyBA = pubKeyBs.toByteArray();
      ByteString lockSript = ByteString
          .copyFrom(ECKey.computeAddress(pubKeyBA));

      vinBuilder.getRawDataBuilder().setPubKey(lockSript);
      transactionBuilderBeforSign.getRawDataBuilder().setVin(i, vinBuilder.build());
      hash = getHash(transactionBuilderBeforSign.build());
      byte[] r = new byte[32];
      byte[] s = new byte[32];

      if (signBA.length != 65) {
        return false;
      }
      System.arraycopy(signBA, 0, r, 0, 32);
      System.arraycopy(signBA, 32, s, 0, 32);
      byte revID = signBA[64];
      ECDSASignature signature = ECDSASignature.fromComponents(r, s, revID);
      //3. check sign
      if (!ECKey.verify(hash, signature, pubKeyBA)) {
        return false;
      }
    }

    return true; //Can't check balance
  }

  public static Transaction sign(Transaction transaction, ECKey myKey) {
    if (TransactionUtils.isCoinbaseTransaction(transaction)) {
      return null;
    }
    ByteString lockSript = ByteString.copyFrom(myKey.getAddress());
    Transaction.Builder transactionBuilderSigned = transaction.toBuilder();
    for (int i = 0; i < transaction.getRawData().getVinList().size(); i++) {
      Transaction.Builder transactionBuilderForSign = transaction.toBuilder();
      TXInput vin = transaction.getRawData().getVin(i);
      TXInput.Builder vinBuilder = vin.toBuilder();
      vinBuilder.clearSignature();
      vinBuilder.getRawDataBuilder().setPubKey(lockSript);
      transactionBuilderForSign.getRawDataBuilder().setVin(i, vinBuilder.build());
      byte[] hash = TransactionUtils.getHash(transactionBuilderForSign.build());
      ECDSASignature signature = myKey.sign(hash);
      byte[] signBA = signature.toByteArray();

      vinBuilder.getRawDataBuilder().setPubKey(ByteString.copyFrom(myKey.getPubKey()));
      vinBuilder.setSignature(ByteString.copyFrom(signBA));
      transactionBuilderSigned.getRawDataBuilder().setVin(i, vinBuilder.build());
    }
    byte[] hash = TransactionUtils.getHash(transactionBuilderSigned.build());
  //  transactionBuilderSigned.setId(ByteString.copyFrom(hash));
    transaction = transactionBuilderSigned.build();
    return transaction;
  }
}
