package org.tron.ledger;

import com.google.protobuf.ByteString;
import org.tron.common.utils.ByteArray;
import org.tron.protos.Protocol;

import static org.tron.ledger.sdk.LedgerConstant.DEFAULT_PATH;

public class LedgerSignUtil {

  /*
  public static byte[] reuqestLedgerSign(Protocol.Transaction transaction) {
    return TronLedgerSignTrans.signTronTransaction(
        ByteArray.toHexString(transaction.getRawData().toByteArray())
        , DEFAULT_PATH);
  }

  public static Protocol.Transaction addSignatureToTransaction(
      Protocol.Transaction transaction, byte[] signByteArr) {
    Protocol.Transaction.Builder transactionBuilderSigned = transaction.toBuilder();
    ByteString bsSign = ByteString.copyFrom(signByteArr);
    transactionBuilderSigned.addSignature(bsSign);
    transaction = transactionBuilderSigned.build();
    return transaction;
  }

   */
}
