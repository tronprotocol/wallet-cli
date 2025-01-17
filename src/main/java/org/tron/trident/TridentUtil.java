package org.tron.trident;

import org.tron.api.GrpcAPI;
import org.tron.protos.Protocol;
import org.tron.protos.contract.AccountContract;
import org.tron.protos.contract.AssetIssueContractOuterClass;
import org.tron.trident.proto.Chain;
import org.tron.trident.proto.Contract;
import org.tron.trident.proto.Response;
import org.tron.api.GrpcAPI.WitnessList;

import java.util.Optional;

public class TridentUtil {

  public static Optional<WitnessList> convertWitnessList(
      Response.WitnessList witnessList) {
    try {
      byte[] bytes = witnessList.toByteArray();
      return Optional.ofNullable(WitnessList.parseFrom(bytes));
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert witnessList", e);
    }
  }
  
  public static Protocol.Account convertAccount(Response.Account account) {
    try {
      byte[] bytes = account.toByteArray();
      return Protocol.Account.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert account", e);
    }
  }

  public static Chain.Transaction convert2TridentTransaction(
      Protocol.Transaction transaction) {
    try {
      byte[] bytes = transaction.toByteArray();
      return Chain.Transaction.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert transaction", e);
    }
  }

  public static Protocol.Transaction convert2ProtoTransaction(
      Chain.Transaction transaction) {
    try {
      byte[] bytes = transaction.toByteArray();
      return Protocol.Transaction.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert transaction", e);
    }
  }

  public static GrpcAPI.TransactionSignWeight convertTransactionSignWeight(
      Response.TransactionSignWeight signWeight) {
    try {
      byte[] bytes = signWeight.toByteArray();
      return GrpcAPI.TransactionSignWeight.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert signWeight", e);
    }
  }

  public static GrpcAPI.TransactionApprovedList convertTransactionApprovedList(
       Response.TransactionApprovedList transactionApprovedList) {
    try {
      byte[] bytes = transactionApprovedList.toByteArray();
      return GrpcAPI.TransactionApprovedList.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert transactionApprovedList", e);
    }
  }

  public static GrpcAPI.BlockExtention convert2ProtoBlockExtention(
      Response.BlockExtention blockExtention) {
    try {
      byte[] bytes = blockExtention.toByteArray();
      return GrpcAPI.BlockExtention.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert blockExtention", e);
    }
  }

  public static GrpcAPI.AssetIssueList convertAssetIssueList(
      Response.AssetIssueList assetIssueList) {
    try {
      byte[] bytes = assetIssueList.toByteArray();
      return GrpcAPI.AssetIssueList.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert assetIssueList", e);
    }
  }

  public static Protocol.Proposal convertProposal(Response.Proposal proposal) {
    try {
      byte[] bytes = proposal.toByteArray();
      return Protocol.Proposal.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert proposal", e);
    }
  }

  public static Protocol.Exchange convertExchange(Response.Exchange exchange) {
    try {
      byte[] bytes = exchange.toByteArray();
      return Protocol.Exchange.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert exchange", e);
    }
  }

  public static GrpcAPI.ExchangeList convertExchangeList(Response.ExchangeList exchangeList) {
    try {
      byte[] bytes = exchangeList.toByteArray();
      return GrpcAPI.ExchangeList.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert exchangeList", e);
    }
  }


  public static GrpcAPI.NodeList convertNodeList(Response.NodeList nodeList) {
    try {
      byte[] bytes = nodeList.toByteArray();
      return GrpcAPI.NodeList.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert nodeList", e);
    }
  }

  public static GrpcAPI.AccountNetMessage convertAccountNetMessage(
      Response.AccountNetMessage accountNetMessage) {
    try {
      byte[] bytes = accountNetMessage.toByteArray();
      return GrpcAPI.AccountNetMessage.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert accountNetMessage", e);
    }
  }

  public static GrpcAPI.AccountResourceMessage convertAccountResourceMessage(
      Response.AccountResourceMessage accountResourceMessage) {
    try {
      byte[] bytes = accountResourceMessage.toByteArray();
      return GrpcAPI.AccountResourceMessage.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert accountResourceMessage", e);
    }
  }

  public static AssetIssueContractOuterClass.AssetIssueContract convertAssetIssueContract(
      Contract.AssetIssueContract assetIssueContract) {
    try {
      byte[] bytes = assetIssueContract.toByteArray();
      return AssetIssueContractOuterClass.AssetIssueContract.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert assetIssueContract", e);
    }
  }

  public static Protocol.TransactionInfo convertTransactionInfo(
      Response.TransactionInfo transactionInfo) {
    try {
      byte[] bytes = transactionInfo.toByteArray();
      return Protocol.TransactionInfo.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert transactionInfo", e);
    }
  }

  public static Protocol.Block convertBlock(
      Chain.Block block) {
    try {
      byte[] bytes = block.toByteArray();
      return Protocol.Block.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert block", e);
    }
  }

  public static GrpcAPI.BlockListExtention convertBlockListExtention(
      Response.BlockListExtention blockListExtention) {
    try {
      byte[] bytes = blockListExtention.toByteArray();
      return GrpcAPI.BlockListExtention.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert blockListExtention", e);
    }
  }

  public static GrpcAPI.ProposalList convertProposalList(
      Response.ProposalList proposalList) {
    try {
      byte[] bytes = proposalList.toByteArray();
      return GrpcAPI.ProposalList.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert proposalList", e);
    }
  }

  public static Protocol.DelegatedResourceAccountIndex convertDelegatedResourceAccountIndex(
      Response.DelegatedResourceAccountIndex delegatedResourceAccountIndex) {
    try {
      byte[] bytes = delegatedResourceAccountIndex.toByteArray();
      return Protocol.DelegatedResourceAccountIndex.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert delegatedResourceAccountIndex", e);
    }
  }

  public static GrpcAPI.DelegatedResourceList convertDelegatedResourceList(
      Response.DelegatedResourceList delegatedResourceList) {
    try {
      byte[] bytes = delegatedResourceList.toByteArray();
      return GrpcAPI.DelegatedResourceList.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert delegatedResourceList", e);
    }
  }

  public static Protocol.ChainParameters convertChainParameters(
      Response.ChainParameters chainParameters) {
    try {
      byte[] bytes = chainParameters.toByteArray();
      return Protocol.ChainParameters.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert chainParameters", e);
    }
  }

  public static Contract.AccountPermissionUpdateContract convertAccountPermissionUpdateContract(
      AccountContract.AccountPermissionUpdateContract accountPermissionUpdateContract) {
    try {
      byte[] bytes = accountPermissionUpdateContract.toByteArray();
      return Contract.AccountPermissionUpdateContract.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert accountPermissionUpdateContract", e);
    }
  }

  public static GrpcAPI.PricesResponseMessage convertPricesResponseMessage(
      Response.PricesResponseMessage pricesResponseMessage) {
    try {
      byte[] bytes = pricesResponseMessage.toByteArray();
      return GrpcAPI.PricesResponseMessage.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert pricesResponseMessage", e);
    }
  }

  public static GrpcAPI.TransactionInfoList convertTransactionInfoList(
      Response.TransactionInfoList transactionInfoList) {
    try {
      byte[] bytes = transactionInfoList.toByteArray();
      return GrpcAPI.TransactionInfoList.parseFrom(bytes);
    } catch (Exception e) {
      throw new RuntimeException("Failed to convert transactionInfoList", e);
    }
  }

}
