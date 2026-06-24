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

import com.google.protobuf.ByteString;
import com.google.protobuf.InvalidProtocolBufferException;
import java.util.Scanner;
import org.bouncycastle.util.encoders.Hex;
import org.tron.common.crypto.Sha256Sm3Hash;
import org.tron.common.crypto.SignInterface;
import org.tron.common.crypto.SignatureInterface;
import org.tron.common.crypto.pqc.PQSchemeRegistry;
import org.tron.common.crypto.pqc.PQSignature;
import org.tron.core.exception.CancelException;
import org.tron.protos.Protocol.PQAuthSig;
import org.tron.protos.Protocol.PQScheme;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.contract.AccountContract;
import org.tron.protos.contract.AccountContract.AccountCreateContract;
import org.tron.protos.contract.AccountContract.AccountPermissionUpdateContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.AssetIssueContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.ParticipateAssetIssueContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.TransferAssetContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.UnfreezeAssetContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.UpdateAssetContract;
import org.tron.protos.contract.BalanceContract;
import org.tron.protos.contract.BalanceContract.FreezeBalanceContract;
import org.tron.protos.contract.BalanceContract.TransferContract;
import org.tron.protos.contract.BalanceContract.UnfreezeBalanceContract;
import org.tron.protos.contract.BalanceContract.WithdrawBalanceContract;
import org.tron.protos.contract.ExchangeContract;
import org.tron.protos.contract.ProposalContract;
import org.tron.protos.contract.SmartContractOuterClass.CreateSmartContract;
import org.tron.protos.contract.SmartContractOuterClass.TriggerSmartContract;
import org.tron.protos.contract.VoteAssetContractOuterClass.VoteAssetContract;
import org.tron.protos.contract.WitnessContract.VoteWitnessContract;
import org.tron.protos.contract.WitnessContract.WitnessCreateContract;
import org.tron.trident.proto.Chain;

public class TransactionUtils {
  private static final ThreadLocal<Integer> PERMISSION_ID_OVERRIDE = new ThreadLocal<>();

  // Protobuf field number of Transaction.pq_auth_sig (Tron.proto). The Trident
  // SDK's Chain.Transaction does not define this field, so on those objects PQ
  // auth signatures are preserved only as unknown field 6. Shared so the
  // bandwidth estimate in WalletApi reads the same field number.
  // TODO(trident-pq): once the Trident SDK models pq_auth_sig on
  // Chain.Transaction, drop this constant and use the generated accessors.
  public static final int PQ_AUTH_SIG_FIELD_NUMBER = 6;

  /** True if the (possibly Trident-typed) transaction carries any PQ auth signature. */
  // TODO(trident-pq): replace the unknown-field probe with
  // transaction.getPqAuthSigCount() > 0 when Trident's Chain.Transaction
  // exposes pq_auth_sig natively.
  private static boolean hasPqAuthSig(Chain.Transaction transaction) {
    return transaction.getUnknownFields().hasField(PQ_AUTH_SIG_FIELD_NUMBER);
  }

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

  public static Sha256Hash getTransactionId(Chain.Transaction transaction) {
    return Sha256Hash.of(true, transaction.getRawData().toByteArray());
  }

  public static Sha256Hash getTransactionId(String rawDataHex) {
    byte[] raw = Hex.decode(rawDataHex);
    return Sha256Hash.of(true, raw);
  }

  public static byte[] getOwner(Transaction.Contract contract) {
    ByteString owner;
    try {
      switch (contract.getType()) {
        case AccountCreateContract:
          owner =
              contract
                  .getParameter()
                  .unpack(AccountCreateContract.class).getOwnerAddress();
          break;
        case TransferContract:
          owner =
              contract
                  .getParameter()
                  .unpack(TransferContract.class)
                  .getOwnerAddress();
          break;
        case TransferAssetContract:
          owner =
              contract
                  .getParameter()
                  .unpack(TransferAssetContract.class)
                  .getOwnerAddress();
          break;
        case VoteAssetContract:
          owner =
              contract
                  .getParameter()
                  .unpack(VoteAssetContract.class)
                  .getOwnerAddress();
          break;
        case VoteWitnessContract:
          owner =
              contract
                  .getParameter()
                  .unpack(VoteWitnessContract.class)
                  .getOwnerAddress();
          break;
        case WitnessCreateContract:
          owner =
              contract
                  .getParameter()
                  .unpack(WitnessCreateContract.class).getOwnerAddress();
          break;
        case AssetIssueContract:
          owner =
              contract
                  .getParameter()
                  .unpack(AssetIssueContract.class)
                  .getOwnerAddress();
          break;
        case ParticipateAssetIssueContract:
          owner =
              contract
                  .getParameter()
                  .unpack(ParticipateAssetIssueContract.class)
                  .getOwnerAddress();
          break;
        case CreateSmartContract:
          owner =
              contract
                  .getParameter()
                  .unpack(CreateSmartContract.class)
                  .getOwnerAddress();
          break;
        case TriggerSmartContract:
          owner =
              contract
                  .getParameter()
                  .unpack(TriggerSmartContract.class)
                  .getOwnerAddress();
          break;
        case FreezeBalanceContract:
          owner =
              contract
                  .getParameter()
                  .unpack(FreezeBalanceContract.class)
                  .getOwnerAddress();
          break;
        case FreezeBalanceV2Contract:
          owner =
              contract
                  .getParameter()
                  .unpack(BalanceContract.FreezeBalanceV2Contract.class)
                  .getOwnerAddress();
          break;
        case UnfreezeBalanceContract:
          owner =
              contract
                  .getParameter()
                  .unpack(UnfreezeBalanceContract.class)
                  .getOwnerAddress();
          break;
        case UnfreezeBalanceV2Contract:
          owner =
              contract
                  .getParameter()
                  .unpack(BalanceContract.UnfreezeBalanceV2Contract.class)
                  .getOwnerAddress();
          break;
        case UnfreezeAssetContract:
          owner =
              contract
                  .getParameter()
                  .unpack(UnfreezeAssetContract.class)
                  .getOwnerAddress();
          break;
        case WithdrawBalanceContract:
          owner =
              contract
                  .getParameter()
                  .unpack(WithdrawBalanceContract.class)
                  .getOwnerAddress();
          break;
        case UpdateAssetContract:
          owner =
              contract
                  .getParameter()
                  .unpack(UpdateAssetContract.class)
                  .getOwnerAddress();
          break;
        case AccountPermissionUpdateContract:
          owner =
              contract
                  .getParameter()
                  .unpack(AccountPermissionUpdateContract.class)
                  .getOwnerAddress();
          break;
        case ProposalCreateContract:
          owner =
              contract
                  .getParameter()
                  .unpack(ProposalContract.ProposalCreateContract.class)
                  .getOwnerAddress();
          break;
        case ProposalApproveContract:
          owner =
              contract
                  .getParameter()
                  .unpack(ProposalContract.ProposalApproveContract.class)
                  .getOwnerAddress();
          break;
        case ProposalDeleteContract:
          owner =
              contract
                  .getParameter()
                  .unpack(ProposalContract.ProposalDeleteContract.class)
                  .getOwnerAddress();
          break;
        case DelegateResourceContract:
          owner =
              contract
                  .getParameter()
                  .unpack(BalanceContract.DelegateResourceContract.class)
                  .getOwnerAddress();
          break;
        case UnDelegateResourceContract:
          owner =
              contract
                  .getParameter()
                  .unpack(BalanceContract.UnDelegateResourceContract.class)
                  .getOwnerAddress();
          break;
        case AccountUpdateContract:
          owner =
              contract
                  .getParameter()
                  .unpack(AccountContract.AccountUpdateContract.class)
                  .getOwnerAddress();
          break;
        case WithdrawExpireUnfreezeContract:
          owner =
              contract
                  .getParameter()
                  .unpack(BalanceContract.WithdrawExpireUnfreezeContract.class)
                  .getOwnerAddress();
          break;
        case ExchangeCreateContract:
          owner =
              contract
                  .getParameter()
                  .unpack(ExchangeContract.ExchangeCreateContract.class)
                  .getOwnerAddress();
          break;
        case ExchangeInjectContract:
          owner =
              contract
                  .getParameter()
                  .unpack(ExchangeContract.ExchangeInjectContract.class)
                  .getOwnerAddress();
          break;
        case ExchangeWithdrawContract:
          owner =
              contract
                  .getParameter()
                  .unpack(ExchangeContract.ExchangeWithdrawContract.class)
                  .getOwnerAddress();
          break;
        case ExchangeTransactionContract:
          owner =
              contract
                  .getParameter()
                  .unpack(ExchangeContract.ExchangeTransactionContract.class)
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

  public static Chain.Transaction sign(Chain.Transaction transaction, SignInterface myKey)
      throws InvalidProtocolBufferException {
    return Chain.Transaction.parseFrom(
        sign(Transaction.parseFrom(transaction.toByteArray()), myKey).toByteArray());
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

  // TODO(trident-pq): this Chain<->Protocol byte round-trip only exists because
  // Trident's Chain.Transaction cannot carry pq_auth_sig. Drop the conversion
  // and add the PQAuthSig directly once Trident models the field.
  public static Chain.Transaction signPQ(
      Chain.Transaction transaction, PQSignature signer, PQScheme scheme)
      throws InvalidProtocolBufferException {
    return Chain.Transaction.parseFrom(
        signPQ(Transaction.parseFrom(transaction.toByteArray()), signer, scheme).toByteArray());
  }

  public static Transaction signPQ(Transaction transaction, PQSignature signer, PQScheme scheme) {
    if (!PQSchemeRegistry.contains(scheme)) {
      throw new IllegalArgumentException("Unsupported or unknown PQScheme: " + scheme);
    }
    if (signer.getScheme() != scheme) {
      throw new IllegalArgumentException("Signer scheme " + signer.getScheme()
          + " does not match requested scheme " + scheme);
    }
    byte[] hash = Sha256Sm3Hash.hash(transaction.getRawData().toByteArray());
    byte[] sig = signer.sign(hash);
    PQAuthSig pqSig = PQAuthSig.newBuilder()
        .setScheme(scheme)
        .setPublicKey(ByteString.copyFrom(signer.getPublicKey()))
        .setSignature(ByteString.copyFrom(sig))
        .build();
    return transaction.toBuilder().addPqAuthSig(pqSig).build();
  }

  public static Transaction setTimestamp(Transaction transaction) {
    long currentTime = System.currentTimeMillis(); // *1000000 + System.nanoTime()%1000000;
    Transaction.Builder builder = transaction.toBuilder();
    Transaction.raw.Builder rowBuilder =
        transaction.getRawData().toBuilder();
    rowBuilder.setTimestamp(currentTime);
    builder.setRawData(rowBuilder.build());
    return builder.build();
  }

  public static Chain.Transaction setTimestamp(Chain.Transaction transaction) {
    long currentTime = System.currentTimeMillis(); // *1000000 + System.nanoTime()%1000000;
    Chain.Transaction.Builder builder = transaction.toBuilder();
    Chain.Transaction.raw.Builder rowBuilder =
        transaction.getRawData().toBuilder();
    rowBuilder.setTimestamp(currentTime);
    builder.setRawData(rowBuilder.build());
    return builder.build();
  }

  public static Chain.Transaction setExpirationTime(Chain.Transaction transaction, boolean multi) {
    // Both ECDSA signatures and PQ auth signatures cover raw_data (the
    // expiration lives there), so refuse to rewrite expiration once EITHER kind
    // of signature is attached — otherwise an already-attached pq_auth_sig is
    // silently invalidated (txid changes -> SIGERROR on broadcast).
    if (transaction.getSignatureCount() == 0 && !hasPqAuthSig(transaction)) {
      long expirationTime =
          System.currentTimeMillis() + (multi ? 24L * 3600 * 1000 : 6 * 60 * 60 * 1000);
      Chain.Transaction.Builder builder = transaction.toBuilder();
      Chain.Transaction.raw.Builder rowBuilder =
          transaction.getRawData().toBuilder();
      rowBuilder.setExpiration(expirationTime);
      builder.setRawData(rowBuilder.build());
      return builder.build();
    }
    return transaction;
  }

  // TODO(trident-pq): the Chain<->Protocol byte round-trip is only needed to
  // preserve pq_auth_sig (and read getPqAuthSigCount() in the Protocol overload)
  // because Trident's Chain.Transaction lacks the field. Simplify once Trident
  // models pq_auth_sig.
  public static Chain.Transaction setPermissionId(Chain.Transaction transaction, String tipString)
      throws CancelException, InvalidProtocolBufferException {
    return Chain.Transaction.parseFrom(
        setPermissionId(Transaction.parseFrom(transaction.toByteArray()), tipString).toByteArray());
  }

  public static Transaction setPermissionId(Transaction transaction, String tipString)
      throws CancelException {
    // Changing permissionId mutates raw_data, which would invalidate any
    // already-attached signature — including PQ auth signatures, which do not
    // bump getSignatureCount(). Bail out if either kind is present.
    if (transaction.getSignatureCount() != 0
        || transaction.getPqAuthSigCount() != 0
        || transaction.getRawData().getContract(0).getPermissionId() != 0) {
      return transaction;
    }

    Integer permissionIdOverride = PERMISSION_ID_OVERRIDE.get();
    if (permissionIdOverride != null) {
      if (permissionIdOverride < 0) {
        throw new CancelException("User cancelled");
      }
      if (permissionIdOverride != 0) {
        Transaction.raw.Builder raw = transaction.getRawData().toBuilder();
        Transaction.Contract.Builder contract =
            raw.getContract(0).toBuilder().setPermissionId(permissionIdOverride);
        raw.clearContract();
        raw.addContract(contract);
        return transaction.toBuilder().setRawData(raw).build();
      }
      return transaction;
    }

    if (tipString == null) {
      return transaction;
    }

    System.out.println(tipString);
    int permissionId = inputPermissionId();
    if (permissionId < 0) {
      throw new CancelException("User cancelled");
    }
    if (permissionId != 0) {
      Transaction.raw.Builder raw = transaction.getRawData().toBuilder();
      Transaction.Contract.Builder contract =
          raw.getContract(0).toBuilder().setPermissionId(permissionId);
      raw.clearContract();
      raw.addContract(contract);
      transaction = transaction.toBuilder().setRawData(raw).build();
    }
    return transaction;
  }

  public static void setPermissionIdOverride(Integer permissionId) {
    if (permissionId == null) {
      PERMISSION_ID_OVERRIDE.remove();
      return;
    }
    if (permissionId < 0 || permissionId > 2) {
      throw new IllegalArgumentException(
          "permissionId must be 0 (Owner), 1 (Witness), or 2 (Active), got: " + permissionId);
    }
    PERMISSION_ID_OVERRIDE.set(permissionId);
  }

  public static void clearPermissionIdOverride() {
    PERMISSION_ID_OVERRIDE.remove();
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
        int id = Integer.parseInt(str);
        if (id < 0 || id > 2) {
          System.out.println("permissionId must be 0 (Owner), 1 (Witness), or 2 (Active). Please re-enter:");
          continue;
        }
        return id;
      } catch (Exception e) {
        return -1;
      }
    }
  }
}
