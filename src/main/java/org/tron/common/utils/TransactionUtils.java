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

import com.google.protobuf.Any;
import com.google.protobuf.ByteString;
import org.tron.api.GrpcAPI;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.ECKey.ECDSASignature;
import org.tron.common.crypto.Sha256Hash;
import org.tron.common.crypto.Sha256Sm3Hash;
import org.tron.common.crypto.SignInterface;
import org.tron.common.crypto.SignatureInterface;
import org.tron.core.exception.CancelException;
import org.tron.core.exception.EncodingException;
import org.tron.core.exception.TransactionException;
import org.tron.protos.Contract;
import org.tron.protos.Protocol;
import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.GrpcClientHolder;
import org.tron.walletserver.WalletApi;

import java.security.SignatureException;
import java.util.Arrays;
import java.util.List;
import java.util.Scanner;

public class TransactionUtils {

  /**
   * Obtain a data bytes after removing the id and SHA-256(data)
   *
   * @param transaction {@link Transaction} transaction
   * @return byte[] the hash of the transaction's data bytes which have no id
   */
  public static byte[] getHash(Transaction transaction) {
    Transaction.Builder tmp = transaction.toBuilder();
    // tmp.clearId();

    return Sha256Sm3Hash.hash(tmp.build().toByteArray());
  }

  public static byte[] getOwner(Transaction.Contract contract) {
    ByteString owner;
    try {
      switch (contract.getType()) {
        case AccountCreateContract:
          owner =
              contract
                  .getParameter()
                  .unpack(org.tron.protos.Contract.AccountCreateContract.class)
                  .getOwnerAddress();
          break;
        case TransferContract:
          owner =
              contract
                  .getParameter()
                  .unpack(org.tron.protos.Contract.TransferContract.class)
                  .getOwnerAddress();
          break;
        case TransferAssetContract:
          owner =
              contract
                  .getParameter()
                  .unpack(org.tron.protos.Contract.TransferAssetContract.class)
                  .getOwnerAddress();
          break;
        case VoteAssetContract:
          owner =
              contract
                  .getParameter()
                  .unpack(org.tron.protos.Contract.VoteAssetContract.class)
                  .getOwnerAddress();
          break;
        case VoteWitnessContract:
          owner =
              contract
                  .getParameter()
                  .unpack(org.tron.protos.Contract.VoteWitnessContract.class)
                  .getOwnerAddress();
          break;
        case WitnessCreateContract:
          owner =
              contract
                  .getParameter()
                  .unpack(org.tron.protos.Contract.WitnessCreateContract.class)
                  .getOwnerAddress();
          break;
        case AssetIssueContract:
          owner =
              contract
                  .getParameter()
                  .unpack(org.tron.protos.Contract.AssetIssueContract.class)
                  .getOwnerAddress();
          break;
        case ParticipateAssetIssueContract:
          owner =
              contract
                  .getParameter()
                  .unpack(org.tron.protos.Contract.ParticipateAssetIssueContract.class)
                  .getOwnerAddress();
          break;
        case CreateSmartContract:
          owner =
              contract
                  .getParameter()
                  .unpack(org.tron.protos.Contract.CreateSmartContract.class)
                  .getOwnerAddress();
          break;
        case TriggerSmartContract:
          owner =
              contract
                  .getParameter()
                  .unpack(org.tron.protos.Contract.TriggerSmartContract.class)
                  .getOwnerAddress();
          break;
        case FreezeBalanceContract:
          owner =
              contract
                  .getParameter()
                  .unpack(org.tron.protos.Contract.FreezeBalanceContract.class)
                  .getOwnerAddress();
          break;
        case UnfreezeBalanceContract:
          owner =
              contract
                  .getParameter()
                  .unpack(org.tron.protos.Contract.UnfreezeBalanceContract.class)
                  .getOwnerAddress();
          break;
        case UnfreezeAssetContract:
          owner =
              contract
                  .getParameter()
                  .unpack(org.tron.protos.Contract.UnfreezeAssetContract.class)
                  .getOwnerAddress();
          break;
        case WithdrawBalanceContract:
          owner =
              contract
                  .getParameter()
                  .unpack(org.tron.protos.Contract.WithdrawBalanceContract.class)
                  .getOwnerAddress();
          break;
        case UpdateAssetContract:
          owner =
              contract
                  .getParameter()
                  .unpack(org.tron.protos.Contract.UpdateAssetContract.class)
                  .getOwnerAddress();
          break;
        case AccountPermissionUpdateContract:
          owner =
              contract
                  .getParameter()
                  .unpack(org.tron.protos.Contract.AccountPermissionUpdateContract.class)
                  .getOwnerAddress();
          break;
        default:
          return null;
      }
      return owner.toByteArray();
    } catch (Exception ex) {
      ex.printStackTrace();
      return null;
    }
  }

  public static String getBase64FromByteString(ByteString sign) {
    byte[] r = sign.substring(0, 32).toByteArray();
    byte[] s = sign.substring(32, 64).toByteArray();
    byte v = sign.byteAt(64);
    if (v < 27) {
      v += 27; // revId -> v
    }
    ECDSASignature signature = ECDSASignature.fromComponents(r, s, v);
    return signature.toBase64();
  }

  /*
   * 1. check hash
   * 2. check double spent
   * 3. check sign
   * 4. check balance
   */
  public static boolean validTransaction(Transaction signedTransaction) {
    assert (signedTransaction.getSignatureCount()
        == signedTransaction.getRawData().getContractCount());
    List<Transaction.Contract> listContract = signedTransaction.getRawData().getContractList();
    byte[] hash = Sha256Sm3Hash.hash(signedTransaction.getRawData().toByteArray());
    int count = signedTransaction.getSignatureCount();
    if (count == 0) {
      return false;
    }
    for (int i = 0; i < count; ++i) {
      try {
        Transaction.Contract contract = listContract.get(i);
        byte[] owner = getOwner(contract);
        byte[] address =
            ECKey.signatureToAddress(
                hash, getBase64FromByteString(signedTransaction.getSignature(i)));
        if (!Arrays.equals(owner, address)) {
          return false;
        }
      } catch (SignatureException e) {
        e.printStackTrace();
        return false;
      }
    }
    return true;
  }

  public static Transaction sign(Transaction transaction, SignInterface myKey) {
    Transaction.Builder transactionBuilderSigned = transaction.toBuilder();
    byte[] hash = Sha256Sm3Hash.hash(transaction.getRawData().toByteArray());
    SignatureInterface signature = myKey.sign(hash);
    ByteString bsSign = ByteString.copyFrom(signature.toByteArray());
    transactionBuilderSigned.addSignature(bsSign);
    transaction = transactionBuilderSigned.build();
    return transaction;
  }

  public static Transaction setTimestamp(Transaction transaction) {
    long currentTime = System.currentTimeMillis(); // *1000000 + System.nanoTime()%1000000;
    Transaction.Builder builder = transaction.toBuilder();
    org.tron.protos.Protocol.Transaction.raw.Builder rowBuilder =
        transaction.getRawData().toBuilder();
    rowBuilder.setTimestamp(currentTime);
    builder.setRawData(rowBuilder.build());
    return builder.build();
  }

  public static Transaction setExpirationTime(Transaction transaction) {
    if (transaction.getSignatureCount() == 0) {
      long expirationTime = System.currentTimeMillis() + 6 * 60 * 60 * 1000;
      Transaction.Builder builder = transaction.toBuilder();
      org.tron.protos.Protocol.Transaction.raw.Builder rowBuilder =
          transaction.getRawData().toBuilder();
      rowBuilder.setExpiration(expirationTime);
      builder.setRawData(rowBuilder.build());
      return builder.build();
    }
    return transaction;
  }

  public static Transaction setPermissionId(Transaction transaction) throws CancelException {
    if (transaction.getSignatureCount() != 0
        || transaction.getRawData().getContract(0).getPermissionId() != 0) {
      return transaction;
    }
    int permission_id = inputPermissionId();
    if (permission_id < 0) {
      throw new CancelException("User cancelled");
    }
    if (permission_id != 0) {
      Transaction.raw.Builder raw = transaction.getRawData().toBuilder();
      Transaction.Contract.Builder contract =
          raw.getContract(0).toBuilder().setPermissionId(permission_id);
      raw.clearContract();
      raw.addContract(contract);
      transaction = transaction.toBuilder().setRawData(raw).build();
    }
    return transaction;
  }

  private static int inputPermissionId() {
    Scanner in = new Scanner(System.in);
    while (true) {
      String input = in.nextLine().trim();
      String str = input.split("\\s+")[0];
      if ("y".equalsIgnoreCase(str)) {
        return 0;
      }
      try {
        return Integer.parseInt(str);
      } catch (Exception e) {
        return -1;
      }
    }
  }

    /**
     * @author Evgeniy Melnikov (e.melnikov@unitedtraders.com)
     */
    public static Transaction send(String from, String to, long amount, ECKey privateKey) throws TransactionException {
        GrpcAPI.TransactionExtention transactionByApi2 = signTransaction(createRawTransaction(from, to, amount), privateKey);
        Transaction transactionSigned = transactionByApi2.getTransaction();
        return broadcastTransaction(transactionSigned);
    }

    public static Transaction createRawTransaction(String from, String to, long amount) {
        byte[] fromByte = WalletApi.decodeFromBase58Check(from);
        byte[] toByte = WalletApi.decodeFromBase58Check(to);

        Transaction.Builder transactionBuilder = Transaction.newBuilder();
        Protocol.Block newestBlock = WalletApi.getBlock(-1);

        Transaction.Contract.Builder contractBuilder = Transaction.Contract.newBuilder();
        Contract.TransferContract.Builder transferContractBuilder = Contract.TransferContract
                .newBuilder();
        transferContractBuilder.setAmount(amount);
        ByteString bsTo = ByteString.copyFrom(toByte);
        ByteString bsOwner = ByteString.copyFrom(fromByte);
        transferContractBuilder.setToAddress(bsTo);
        transferContractBuilder.setOwnerAddress(bsOwner);
        try {
            Any any = Any.pack(transferContractBuilder.build());
            contractBuilder.setParameter(any);
        } catch (Exception e) {
            return null;
        }
        contractBuilder.setType(Transaction.Contract.ContractType.TransferContract);
        transactionBuilder.getRawDataBuilder().addContract(contractBuilder)
                .setTimestamp(System.currentTimeMillis())
                .setExpiration(newestBlock.getBlockHeader().getRawData().getTimestamp() + 10 * 60 * 60 * 1000);
        Transaction transaction = transactionBuilder.build();
        Transaction refTransaction = setReference(transaction, newestBlock);
        return refTransaction;
    }

    public static GrpcAPI.TransactionExtention signTransaction(Transaction rawTransaction, ECKey privateKey) {
        return signTransactionByApi2(rawTransaction, privateKey.getPrivKeyBytes());
    }

    public static Transaction signTransactionOffline(Transaction transaction, String privateKey) {
        byte[] privKeyBytes = org.tron.common.utils.ByteArray.fromHexString(privateKey);
        ECKey myKey = ECKey.fromPrivate(privKeyBytes);
        Transaction.Builder transactionBuilderSigned = transaction.toBuilder();
        byte[] hash = Sha256Sm3Hash.hash(transaction.getRawData().toByteArray());
        SignatureInterface signature = myKey.sign(hash);
        ByteString bsSign = ByteString.copyFrom(signature.toByteArray());
        transactionBuilderSigned.addSignature(bsSign);
        transaction = transactionBuilderSigned.build();
        return transaction;
    }

    public static Transaction broadcastTransaction(Transaction transactionSigned) {
        GrpcAPI.TransactionSignWeight weight = WalletApi.getTransactionSignWeight(transactionSigned);

        if (weight.getResult().getCode() == GrpcAPI.TransactionSignWeight.Result.response_code.NOT_ENOUGH_PERMISSION) {
            throw new TransactionException(String.format("Current signWeight is: %s. Get error with response code: %s",
                    Utils.printTransactionSignWeight(weight), GrpcAPI.TransactionSignWeight.Result.response_code.NOT_ENOUGH_PERMISSION.name()),
                    weight.getResult().getCode().name(), weight.getResult().getCode().getNumber()
            );
        }

        boolean broadcastTransaction = GrpcClientHolder.getGrpcClient().broadcastTransaction(transactionSigned);
        if (!broadcastTransaction) {
            throw new TransactionException("Something gone wrong. Status false after broadcast transaction.", "OTHER_ERROR", 20);
        }
        return transactionSigned;
    }

    public static Transaction setReference(Transaction transaction, Protocol.Block newestBlock) {
        long blockHeight = newestBlock.getBlockHeader().getRawData().getNumber();
        byte[] blockHash = getBlockHash(newestBlock).getBytes();
        byte[] refBlockNum = ByteArray.fromLong(blockHeight);
        Transaction.raw rawData = transaction.getRawData().toBuilder()
                .setRefBlockHash(ByteString.copyFrom(ByteArray.subArray(blockHash, 8, 16)))
                .setRefBlockBytes(ByteString.copyFrom(ByteArray.subArray(refBlockNum, 6, 8)))
                .build();
        return transaction.toBuilder().setRawData(rawData).build();
    }

    public static Sha256Hash getBlockHash(Protocol.Block block) {
        return Sha256Hash.of(block.getBlockHeader().getRawData().toByteArray());
    }

    public static GrpcAPI.TransactionExtention signTransactionByApi2(
            Transaction transaction, byte[] privateKey) {
        transaction = TransactionUtils.setExpirationTime(transaction);
        Protocol.TransactionSign.Builder builder = Protocol.TransactionSign.newBuilder();
        builder.setPrivateKey(ByteString.copyFrom(privateKey));
        builder.setTransaction(transaction);
        return GrpcClientHolder.getGrpcClient().signTransaction2(builder.build());
    }

    public static boolean validateAddress(String address) {
        try {
            WalletApi.decodeFromBase58Check(address);
        } catch (EncodingException ex) {
            return false;
        }
        return true;
    }
}
