/*
 * Copyright (c) [2016] [ <ether.camp> ]
 * This file is part of the ethereumJ library.
 *
 * The ethereumJ library is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The ethereumJ library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with the ethereumJ library. If not, see <http://www.gnu.org/licenses/>.
 */

package org.tron.common.utils;

import com.google.protobuf.ByteString;
import java.io.Console;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.Charset;
import java.security.SecureRandom;
import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import org.bouncycastle.util.encoders.Hex;
import org.tron.api.GrpcAPI.AccountNetMessage;
import org.tron.api.GrpcAPI.AccountResourceMessage;
import org.tron.api.GrpcAPI.AssetIssueList;
import org.tron.api.GrpcAPI.BlockExtention;
import org.tron.api.GrpcAPI.BlockList;
import org.tron.api.GrpcAPI.BlockListExtention;
import org.tron.api.GrpcAPI.DelegatedResourceList;
import org.tron.api.GrpcAPI.ExchangeList;
import org.tron.api.GrpcAPI.ProposalList;
import org.tron.api.GrpcAPI.TransactionExtention;
import org.tron.api.GrpcAPI.TransactionList;
import org.tron.api.GrpcAPI.TransactionListExtention;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.common.crypto.Sha256Hash;
import org.tron.keystore.StringUtils;
import org.tron.protos.Contract.AccountCreateContract;
import org.tron.protos.Contract.AccountUpdateContract;
import org.tron.protos.Contract.AssetIssueContract;
import org.tron.protos.Contract.AssetIssueContract.FrozenSupply;
import org.tron.protos.Contract.CreateSmartContract;
import org.tron.protos.Contract.ExchangeCreateContract;
import org.tron.protos.Contract.ExchangeInjectContract;
import org.tron.protos.Contract.ExchangeTransactionContract;
import org.tron.protos.Contract.ExchangeWithdrawContract;
import org.tron.protos.Contract.FreezeBalanceContract;
import org.tron.protos.Contract.ParticipateAssetIssueContract;
import org.tron.protos.Contract.ProposalApproveContract;
import org.tron.protos.Contract.ProposalCreateContract;
import org.tron.protos.Contract.ProposalDeleteContract;
import org.tron.protos.Contract.TransferAssetContract;
import org.tron.protos.Contract.TransferContract;
import org.tron.protos.Contract.TriggerSmartContract;
import org.tron.protos.Contract.UnfreezeAssetContract;
import org.tron.protos.Contract.UnfreezeBalanceContract;
import org.tron.protos.Contract.UpdateAssetContract;
import org.tron.protos.Contract.VoteAssetContract;
import org.tron.protos.Contract.VoteWitnessContract;
import org.tron.protos.Contract.WithdrawBalanceContract;
import org.tron.protos.Contract.WitnessCreateContract;
import org.tron.protos.Contract.WitnessUpdateContract;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.Account.AccountResource;
import org.tron.protos.Protocol.Account.Frozen;
import org.tron.protos.Protocol.Block;
import org.tron.protos.Protocol.BlockHeader;
import org.tron.protos.Protocol.ChainParameters;
import org.tron.protos.Protocol.ChainParameters.ChainParameter;
import org.tron.protos.Protocol.DelegatedResource;
import org.tron.protos.Protocol.DelegatedResourceAccountIndex;
import org.tron.protos.Protocol.Exchange;
import org.tron.protos.Protocol.InternalTransaction;
import org.tron.protos.Protocol.Proposal;
import org.tron.protos.Protocol.ResourceReceipt;
import org.tron.protos.Protocol.SmartContract;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.Protocol.Transaction.Contract;
import org.tron.protos.Protocol.Transaction.Result;
import org.tron.protos.Protocol.TransactionInfo;
import org.tron.protos.Protocol.TransactionInfo.Log;
import org.tron.protos.Protocol.TransactionInfo.code;
import org.tron.protos.Protocol.Vote;
import org.tron.protos.Protocol.Witness;
import org.tron.walletserver.WalletApi;

public class Utils {

  private static SecureRandom random = new SecureRandom();

  public static SecureRandom getRandom() {
    return random;
  }

  public static byte[] getBytes(char[] chars) {
    Charset cs = Charset.forName("UTF-8");
    CharBuffer cb = CharBuffer.allocate(chars.length);
    cb.put(chars);
    cb.flip();
    ByteBuffer bb = cs.encode(cb);

    return bb.array();
  }

  private char[] getChars(byte[] bytes) {
    Charset cs = Charset.forName("UTF-8");
    ByteBuffer bb = ByteBuffer.allocate(bytes.length);
    bb.put(bytes);
    bb.flip();
    CharBuffer cb = cs.decode(bb);

    return cb.array();
  }

  /**
   * yyyy-MM-dd
   */
  public static Date strToDateLong(String strDate) {
    if (strDate.length() == 10) {
      SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd");
      ParsePosition pos = new ParsePosition(0);
      Date strtodate = formatter.parse(strDate, pos);
      return strtodate;
    } else if (strDate.length() == 19) {
      strDate = strDate.replace("_", " ");
      SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
      ParsePosition pos = new ParsePosition(0);
      Date strtodate = formatter.parse(strDate, pos);
      return strtodate;
    }
    return null;
  }

  public static String printAccount(Account account) {
    String result = "";
    result += "address: ";
    result += WalletApi.encode58Check(account.getAddress().toByteArray());
    result += "\n";
    if (account.getAccountId() != null && !account.getAccountId().isEmpty()) {
      result += "account_id: ";
      result += new String(account.getAccountId().toByteArray(), Charset.forName("UTF-8"));
      result += "\n";
    }
    if (account.getAccountName() != null && !account.getAccountName().isEmpty()) {
      result += "account_name: ";
      result += new String(account.getAccountName().toByteArray(), Charset.forName("UTF-8"));
      result += "\n";
    }
    result += "type: ";
    result += account.getTypeValue();
    result += "\n";
    result += "balance: ";
    result += account.getBalance();
    result += "\n";
    if (account.getFrozenCount() > 0) {
      for (Frozen frozen : account.getFrozenList()) {
        result += "frozen";
        result += "\n";
        result += "{";
        result += "\n";
        result += "  frozen_balance: ";
        result += frozen.getFrozenBalance();
        result += "\n";
        result += "  expire_time: ";
        result += new Date(frozen.getExpireTime());
        result += "\n";
        result += "}";
        result += "\n";
      }
    }
    result += "free_net_usage: ";
    result += account.getFreeNetUsage();
    result += "\n";
    result += "net_usage: ";
    result += account.getNetUsage();
    result += "\n";
    if (account.getCreateTime() != 0) {
      result += "create_time: ";
      result += new Date(account.getCreateTime());
      result += "\n";
    }
    if (account.getVotesCount() > 0) {
      for (Vote vote : account.getVotesList()) {
        result += "votes";
        result += "\n";
        result += "{";
        result += "\n";
        result += "  vote_address: ";
        result += WalletApi.encode58Check(vote.getVoteAddress().toByteArray());
        result += "\n";
        result += "  vote_count: ";
        result += vote.getVoteCount();
        result += "\n";
        result += "}";
        result += "\n";
      }
    }
    if (account.getAssetCount() > 0) {
      for (String name : account.getAssetMap().keySet()) {
        result += "asset";
        result += "\n";
        result += "{";
        result += "\n";
        result += "  name: ";
        result += name;
        result += "\n";
        result += "  balance: ";
        result += account.getAssetMap().get(name);
        result += "\n";
        result += "  latest_asset_operation_time: ";
        result += account.getLatestAssetOperationTimeMap().get(name);
        result += "\n";
        result += "  free_asset_net_usage: ";
        result += account.getFreeAssetNetUsageMap().get(name);
        result += "\n";
        result += "}";
        result += "\n";
      }
    }
    result += "asset issued id:";
    result += account.getAssetIssuedID().toStringUtf8();
    result += "\n";
    if (account.getAssetV2Count() > 0) {
      for (String id : account.getAssetV2Map().keySet()) {
        result += "assetV2";
        result += "\n";
        result += "{";
        result += "\n";
        result += "  id: ";
        result += id;
        result += "\n";
        result += "  balance: ";
        result += account.getAssetV2Map().get(id);
        result += "\n";
        result += "  latest_asset_operation_timeV2: ";
        result += account.getLatestAssetOperationTimeV2Map().get(id);
        result += "\n";
        result += "  free_asset_net_usageV2: ";
        result += account.getFreeAssetNetUsageV2Map().get(id);
        result += "\n";
        result += "}";
        result += "\n";
      }
    }
    if (account.getFrozenSupplyCount() > 0) {
      for (Frozen frozen : account.getFrozenSupplyList()) {
        result += "frozen_supply";
        result += "\n";
        result += "{";
        result += "\n";
        result += "  amount: ";
        result += frozen.getFrozenBalance();
        result += "\n";
        result += "  expire_time: ";
        result += new Date(frozen.getExpireTime());
        result += "\n";
        result += "}";
        result += "\n";
      }
    }
    result += "latest_opration_time: ";
    result += new Date(account.getLatestOprationTime());
    result += "\n";

    result += "latest_consume_time: ";
    result += account.getLatestConsumeTime();
    result += "\n";

    result += "latest_consume_free_time: ";
    result += account.getLatestConsumeFreeTime();
    result += "\n";

    result += "allowance: ";
    result += account.getAllowance();
    result += "\n";

    result += "latest_withdraw_time: ";
    result += new Date(account.getLatestWithdrawTime());
    result += "\n";

//    result += "code: ";
//    result += account.getCode();
//    result += "\n";
//
    result += "is_witness: ";
    result += account.getIsWitness();
    result += "\n";
//
//    result += "is_committee: ";
//    result += account.getIsCommittee();
//    result += "\n";

    result += "asset_issued_name: ";
    result += account.getAssetIssuedName().toStringUtf8();
    result += "\n";
    result += "accountResource: {\n";
    result += printAccountResource(account.getAccountResource());
    result += "\n";
    result += "acquiredDelegatedFrozenBalanceForBandwidth: ";
    result += account.getAcquiredDelegatedFrozenBalanceForBandwidth();
    result += "\n";
    result += "delegatedFrozenBalanceForBandwidth: ";
    result += account.getDelegatedFrozenBalanceForBandwidth();
    result += "\n";
    result += "acquiredDelegatedFrozenBalanceForEnergy: ";
    result += account.getAccountResource().getAcquiredDelegatedFrozenBalanceForEnergy();
    result += "\n";
    result += "delegatedFrozenBalanceForEnergy: ";
    result += account.getAccountResource().getDelegatedFrozenBalanceForEnergy();
    result += "}\n";
    return result;
  }

  public static String printAccountResource(AccountResource accountResource) {
    String result = "";
    result += "energy_usage: ";
    result += accountResource.getEnergyUsage();
    result += "\n";
    result += "frozen_balance_for_energy: ";
    result += "{";
    result += "\n";
    result += "  amount: ";
    result += accountResource.getFrozenBalanceForEnergy().getFrozenBalance();
    result += "\n";
    result += "  expire_time: ";
    result += new Date(accountResource.getFrozenBalanceForEnergy().getExpireTime());
    result += "\n";
    result += "}";
    result += "\n";
    result += "latest_consume_time_for_energy: ";
    result += accountResource.getLatestConsumeTimeForEnergy();
    result += "\n";
    result += "storage_limit: ";
    result += accountResource.getStorageLimit();
    result += "\n";
    result += "storage_usage: ";
    result += accountResource.getStorageUsage();
    result += "\n";
    result += "latest_exchange_storage_time: ";
    result += accountResource.getLatestExchangeStorageTime();
    result += "\n";
    return result;
  }

//  public static String printAccountList(AccountList accountList) {
//    String result = "\n";
//    int i = 0;
//    for (Account account : accountList.getAccountsList()) {
//      result += "account " + i + " :::";
//      result += "\n";
//      result += "[";
//      result += "\n";
//      result += printAccount(account);
//      result += "]";
//      result += "\n";
//      result += "\n";
//      i++;
//    }
//    return result;
//  }

  public static String printWitness(Witness witness) {
    String result = "";
    result += "address: ";
    result += WalletApi.encode58Check(witness.getAddress().toByteArray());
    result += "\n";
    result += "voteCount: ";
    result += witness.getVoteCount();
    result += "\n";
    result += "pubKey: ";
    result += ByteArray.toHexString(witness.getPubKey().toByteArray());
    result += "\n";
    result += "url: ";
    result += witness.getUrl();
    result += "\n";
    result += "totalProduced: ";
    result += witness.getTotalProduced();
    result += "\n";
    result += "totalMissed: ";
    result += witness.getTotalMissed();
    result += "\n";
    result += "latestBlockNum: ";
    result += witness.getLatestBlockNum();
    result += "\n";
    result += "latestSlotNum: ";
    result += witness.getLatestSlotNum();
    result += "\n";
    result += "isJobs: ";
    result += witness.getIsJobs();
    result += "\n";
    return result;
  }

  public static String printProposal(Proposal proposal) {
    String result = "";
    result += "id: ";
    result += proposal.getProposalId();
    result += "\n";
    result += "state: ";
    result += proposal.getState();
    result += "\n";
    result += "createTime: ";
    result += proposal.getCreateTime();
    result += "\n";
    result += "expirationTime: ";
    result += proposal.getExpirationTime();
    result += "\n";
    result += "parametersMap: ";
    result += proposal.getParametersMap();
    result += "\n";
    result += "approvalsList: [ \n";
    for (ByteString address : proposal.getApprovalsList()) {
      result += WalletApi.encode58Check(address.toByteArray());
      result += "\n";
    }
    result += "]";
    return result;
  }

  public static String printProposalsList(ProposalList proposalList) {
    String result = "\n";
    int i = 0;
    for (Proposal proposal : proposalList.getProposalsList()) {
      result += "proposal " + i + " :::";
      result += "\n";
      result += "[";
      result += "\n";
      result += printProposal(proposal);
      result += "]";
      result += "\n";
      result += "\n";
      i++;
    }
    return result;
  }


  public static String printDelegatedResourceList(DelegatedResourceList delegatedResourceList) {
    String result = "" + delegatedResourceList.getDelegatedResourceCount() + "\n";
    result += "DelegatedResourceList: [ \n";
    for (DelegatedResource delegatedResource : delegatedResourceList.getDelegatedResourceList()) {
      result += printDelegatedResource(delegatedResource);
      result += "\n";
    }
    result += "]";
    return result;
  }

  public static String printDelegatedResourceAccountIndex(
      DelegatedResourceAccountIndex delegatedResourceAccountIndex) {

    String result = "";
    result += "address: ";
    result += WalletApi.encode58Check(delegatedResourceAccountIndex.getAccount().toByteArray());

    result += "from: [ \n";
    for (ByteString fromAddress : delegatedResourceAccountIndex.getFromAccountsList()) {
      result += WalletApi.encode58Check(fromAddress.toByteArray());
      result += "\n";
    }
    result += "]";

    result += "to: [ \n";
    for (ByteString toAddress : delegatedResourceAccountIndex.getToAccountsList()) {
      result += WalletApi.encode58Check(toAddress.toByteArray());
      result += "\n";
    }
    result += "]";
    return result;
  }


  public static String printDelegatedResource(DelegatedResource delegatedResource) {
    String result = "";
    result += "from: ";
    result += WalletApi.encode58Check(delegatedResource.getFrom().toByteArray());
    result += "\n";
    result += "to: ";
    result += WalletApi.encode58Check(delegatedResource.getTo().toByteArray());
    result += "\n";
    result += "frozenBalanceForBandwidth: ";
    result += delegatedResource.getFrozenBalanceForBandwidth();
    result += "\n";
    result += "expireTimeForBandwidth: ";
    result += delegatedResource.getExpireTimeForBandwidth();
    result += "\n";
    result += "frozenBalanceForEnergy: ";
    result += delegatedResource.getFrozenBalanceForEnergy();
    result += "\n";
    result += "expireTimeForEnergy: ";
    result += delegatedResource.getExpireTimeForEnergy();
    result += "\n";
    return result;
  }

  public static String printExchange(Exchange exchange) {
    String result = "";
    result += "id: ";
    result += exchange.getExchangeId();
    result += "\n";
    result += "creator: ";
    result += WalletApi.encode58Check(exchange.getCreatorAddress().toByteArray());
    result += "\n";
    result += "createTime: ";
    result += exchange.getCreateTime();
    result += "\n";
    result += "firstTokenId: ";
    result += exchange.getFirstTokenId().toStringUtf8();
    result += "\n";
    result += "firstTokenBalance: ";
    result += exchange.getFirstTokenBalance();
    result += "\n";
    result += "secondTokenId: ";
    result += exchange.getSecondTokenId().toStringUtf8();
    result += "\n";
    result += "secondTokenBalance: ";
    result += exchange.getSecondTokenBalance();
    result += "\n";
    return result;
  }

  public static String printExchangeList(ExchangeList exchangeList) {
    String result = "\n";
    int i = 0;
    for (Exchange exchange : exchangeList.getExchangesList()) {
      result += "exchange " + i + " :::";
      result += "\n";
      result += "[";
      result += "\n";
      result += printExchange(exchange);
      result += "]";
      result += "\n";
      result += "\n";
      i++;
    }
    return result;
  }

  public static String printChainParameters(ChainParameters chainParameters) {
    String result = "\n";
    result += "ChainParameters : \n";
    for (ChainParameter para : chainParameters.getChainParameterList()) {
      result += para.getKey() + " : " + para.getValue();
      result += "\n";
    }
    return result;
  }

  public static String printWitnessList(WitnessList witnessList) {
    String result = "\n";
    int i = 0;
    for (Witness witness : witnessList.getWitnessesList()) {
      result += "witness " + i + " :::";
      result += "\n";
      result += "[";
      result += "\n";
      result += printWitness(witness);
      result += "]";
      result += "\n";
      result += "\n";
      i++;
    }
    return result;
  }


  public static String printAssetIssue(AssetIssueContract assetIssue) {
    String result = "";
    result += "id: ";
    result += assetIssue.getId();
    result += "\n";
    result += "owner_address: ";
    result += WalletApi.encode58Check(assetIssue.getOwnerAddress().toByteArray());
    result += "\n";
    result += "name: ";
    result += new String(assetIssue.getName().toByteArray(), Charset.forName("UTF-8"));
    result += "\n";
    result += "order: ";
    result += assetIssue.getOrder();
    result += "\n";
    result += "total_supply: ";
    result += assetIssue.getTotalSupply();
    result += "\n";
    result += "trx_num: ";
    result += assetIssue.getTrxNum();
    result += "\n";
    result += "num: ";
    result += assetIssue.getNum();
    result += "\n";
    result += "precision ";
    result += assetIssue.getPrecision();
    result += "\n";
    result += "start_time: ";
    result += new Date(assetIssue.getStartTime());
    result += "\n";
    result += "end_time: ";
    result += new Date(assetIssue.getEndTime());
    result += "\n";
    result += "vote_score: ";
    result += assetIssue.getVoteScore();
    result += "\n";
    result += "description: ";
    result += new String(assetIssue.getDescription().toByteArray(), Charset.forName("UTF-8"));
    result += "\n";
    result += "url: ";
    result += new String(assetIssue.getUrl().toByteArray(), Charset.forName("UTF-8"));
    result += "\n";
    result += "free asset net limit: ";
    result += assetIssue.getFreeAssetNetLimit();
    result += "\n";
    result += "public free asset net limit: ";
    result += assetIssue.getPublicFreeAssetNetLimit();
    result += "\n";
    result += "public free asset net usage: ";
    result += assetIssue.getPublicFreeAssetNetUsage();
    result += "\n";
    result += "public latest free net time: ";
    result += assetIssue.getPublicLatestFreeNetTime();
    result += "\n";

    if (assetIssue.getFrozenSupplyCount() > 0) {
      for (FrozenSupply frozenSupply : assetIssue.getFrozenSupplyList()) {
        result += "frozen_supply";
        result += "\n";
        result += "{";
        result += "\n";
        result += "  amount: ";
        result += frozenSupply.getFrozenAmount();
        result += "\n";
        result += "  frozen_days: ";
        result += frozenSupply.getFrozenDays();
        result += "\n";
        result += "}";
        result += "\n";
      }
    }

    if (assetIssue.getId().equals("")) {
      result += "\n";
      result += "Note: In 3.2, you can use getAssetIssueById or getAssetIssueListByName, because 3.2 allows same token name.";
      result += "\n";
    }
    return result;
  }

  public static String printAssetIssueList(AssetIssueList assetIssueList) {
    String result = "\n";
    int i = 0;
    for (AssetIssueContract assetIssue : assetIssueList.getAssetIssueList()) {
      result += "assetIssue " + i + " :::";
      result += "\n";
      result += "[";
      result += "\n";
      result += printAssetIssue(assetIssue);
      result += "]";
      result += "\n";
      result += "\n";
      i++;
    }
    return result;
  }

  public static String printContract(Transaction.Contract contract) {
    String result = "";
    try {
      result += "contract_type: ";
      result += contract.getType();
      result += "\n";

      switch (contract.getType()) {
        case AccountCreateContract:
          AccountCreateContract accountCreateContract = contract.getParameter()
              .unpack(AccountCreateContract.class);
          result += "type: ";
          result += accountCreateContract.getType();
          result += "\n";
          if (accountCreateContract.getAccountAddress() != null
              && !accountCreateContract.getAccountAddress().isEmpty()) {
            result += "account_address: ";
            result += WalletApi
                .encode58Check(accountCreateContract.getAccountAddress().toByteArray());
            result += "\n";
          }
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(accountCreateContract.getOwnerAddress().toByteArray());
          result += "\n";
          break;
        case AccountUpdateContract:
          AccountUpdateContract accountUpdateContract = contract.getParameter()
              .unpack(AccountUpdateContract.class);
          if (accountUpdateContract.getAccountName() != null
              && !accountUpdateContract.getAccountName().isEmpty()) {
            result += "account_name: ";
            result += new String(accountUpdateContract.getAccountName().toByteArray(),
                Charset.forName("UTF-8"));
            result += "\n";
          }
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(accountUpdateContract.getOwnerAddress().toByteArray());
          result += "\n";
          break;
        case TransferContract:
          TransferContract transferContract = contract.getParameter()
              .unpack(TransferContract.class);
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(transferContract.getOwnerAddress().toByteArray());
          result += "\n";
          result += "to_address: ";
          result += WalletApi
              .encode58Check(transferContract.getToAddress().toByteArray());
          result += "\n";
          result += "amount: ";
          result += transferContract.getAmount();
          result += "\n";
          break;
        case TransferAssetContract:
          TransferAssetContract transferAssetContract = contract.getParameter()
              .unpack(TransferAssetContract.class);
          result += "asset_name: ";
          result += new String(transferAssetContract.getAssetName().toByteArray(),
              Charset.forName("UTF-8"));
          result += "\n";
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(transferAssetContract.getOwnerAddress().toByteArray());
          result += "\n";
          result += "to_address: ";
          result += WalletApi
              .encode58Check(transferAssetContract.getToAddress().toByteArray());
          result += "\n";
          result += "amount: ";
          result += transferAssetContract.getAmount();
          result += "\n";
          break;
        case VoteAssetContract:
          VoteAssetContract voteAssetContract = contract.getParameter()
              .unpack(VoteAssetContract.class);
          break;
        case VoteWitnessContract:
          VoteWitnessContract voteWitnessContract = contract.getParameter()
              .unpack(VoteWitnessContract.class);
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(voteWitnessContract.getOwnerAddress().toByteArray());
          result += "\n";
          result += "votes: ";
          result += "\n";
          result += "{";
          result += "\n";
          for (VoteWitnessContract.Vote vote : voteWitnessContract.getVotesList()) {
            result += "[";
            result += "\n";
            result += "vote_address: ";
            result += WalletApi
                .encode58Check(vote.getVoteAddress().toByteArray());
            result += "\n";
            result += "vote_count: ";
            result += vote.getVoteCount();
            result += "\n";
            result += "]";
            result += "\n";
          }
          result += "}";
          result += "\n";
          break;
        case WitnessCreateContract:
          WitnessCreateContract witnessCreateContract = contract.getParameter()
              .unpack(WitnessCreateContract.class);
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(witnessCreateContract.getOwnerAddress().toByteArray());
          result += "\n";
          result += "url: ";
          result += new String(witnessCreateContract.getUrl().toByteArray(),
              Charset.forName("UTF-8"));
          result += "\n";
          break;
        case WitnessUpdateContract:
          WitnessUpdateContract witnessUpdateContract = contract.getParameter()
              .unpack(WitnessUpdateContract.class);
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(witnessUpdateContract.getOwnerAddress().toByteArray());
          result += "\n";
          result += "url: ";
          result += new String(witnessUpdateContract.getUpdateUrl().toByteArray(),
              Charset.forName("UTF-8"));
          result += "\n";
          break;
        case AssetIssueContract:
          AssetIssueContract assetIssueContract = contract.getParameter()
              .unpack(AssetIssueContract.class);
          result += printAssetIssue(assetIssueContract);
          break;
        case UpdateAssetContract:
          UpdateAssetContract updateAssetContract = contract.getParameter()
              .unpack(UpdateAssetContract.class);
          result += "owner_address: ";
          result += WalletApi.encode58Check(updateAssetContract.getOwnerAddress().toByteArray());
          result += "\n";
          result += "description: ";
          result += new String(updateAssetContract.getDescription().toByteArray(),
              Charset.forName("UTF-8"));
          result += "\n";
          result += "url: ";
          result += new String(updateAssetContract.getUrl().toByteArray(),
              Charset.forName("UTF-8"));
          result += "\n";
          result += "free asset net limit: ";
          result += updateAssetContract.getNewLimit();
          result += "\n";
          result += "public free asset net limit: ";
          result += updateAssetContract.getNewPublicLimit();
          result += "\n";
          break;
        case ParticipateAssetIssueContract:
          ParticipateAssetIssueContract participateAssetIssueContract = contract.getParameter()
              .unpack(ParticipateAssetIssueContract.class);
          result += "asset_name: ";
          result += new String(participateAssetIssueContract.getAssetName().toByteArray(),
              Charset.forName("UTF-8"));
          result += "\n";
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(participateAssetIssueContract.getOwnerAddress().toByteArray());
          result += "\n";
          result += "to_address: ";
          result += WalletApi
              .encode58Check(participateAssetIssueContract.getToAddress().toByteArray());
          result += "\n";
          result += "amount: ";
          result += participateAssetIssueContract.getAmount();
          result += "\n";
          break;
        case FreezeBalanceContract:
          FreezeBalanceContract freezeBalanceContract = contract.getParameter()
              .unpack(FreezeBalanceContract.class);
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(freezeBalanceContract.getOwnerAddress().toByteArray());
          result += "\n";
          result += "frozen_balance: ";
          result += freezeBalanceContract.getFrozenBalance();
          result += "\n";
          result += "frozen_duration: ";
          result += freezeBalanceContract.getFrozenDuration();
          result += "\n";
          break;
        case UnfreezeBalanceContract:
          UnfreezeBalanceContract unfreezeBalanceContract = contract.getParameter()
              .unpack(UnfreezeBalanceContract.class);
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(unfreezeBalanceContract.getOwnerAddress().toByteArray());
          result += "\n";
          break;
        case UnfreezeAssetContract:
          UnfreezeAssetContract unfreezeAssetContract = contract.getParameter()
              .unpack(UnfreezeAssetContract.class);
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(unfreezeAssetContract.getOwnerAddress().toByteArray());
          result += "\n";
          break;
        case WithdrawBalanceContract:
          WithdrawBalanceContract withdrawBalanceContract = contract.getParameter()
              .unpack(WithdrawBalanceContract.class);
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(withdrawBalanceContract.getOwnerAddress().toByteArray());
          result += "\n";
          break;
        case CreateSmartContract:
          CreateSmartContract createSmartContract = contract.getParameter()
              .unpack(CreateSmartContract.class);
          SmartContract newContract = createSmartContract.getNewContract();
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(createSmartContract.getOwnerAddress().toByteArray());
          result += "\n";
          result += "ABI: ";
          result += newContract.getAbi().toString();
          result += "\n";
          result += "byte_code: ";
          result += Hex.toHexString(newContract.getBytecode().toByteArray());
          result += "\n";
          result += "call_value: ";
          result += newContract.getCallValue();
          result += "\n";
          result += "contract_address:";
          result += WalletApi.encode58Check(newContract.getContractAddress().toByteArray());
          result += "\n";
          break;
        case TriggerSmartContract:
          TriggerSmartContract triggerSmartContract = contract.getParameter()
              .unpack(TriggerSmartContract.class);
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(triggerSmartContract.getOwnerAddress().toByteArray());
          result += "\n";
          result += "contract_address: ";
          result += WalletApi
              .encode58Check(triggerSmartContract.getContractAddress().toByteArray());
          result += "\n";
          result += "call_value:";
          result += triggerSmartContract.getCallValue();
          result += "\n";
          result += "data:";
          result += Hex.toHexString(triggerSmartContract.getData().toByteArray());
          result += "\n";
          break;
        case ProposalCreateContract:
          ProposalCreateContract proposalCreateContract = contract.getParameter()
              .unpack(ProposalCreateContract.class);
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(proposalCreateContract.getOwnerAddress().toByteArray());
          result += "\n";
          result += "parametersMap: ";
          result += proposalCreateContract.getParametersMap();
          result += "\n";
          break;
        case ProposalApproveContract:
          ProposalApproveContract proposalApproveContract = contract.getParameter()
              .unpack(ProposalApproveContract.class);
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(proposalApproveContract.getOwnerAddress().toByteArray());
          result += "\n";
          result += "proposal id: ";
          result += proposalApproveContract.getProposalId();
          result += "\n";
          result += "IsAddApproval: ";
          result += proposalApproveContract.getIsAddApproval();
          result += "\n";
          break;
        case ProposalDeleteContract:
          ProposalDeleteContract proposalDeleteContract = contract.getParameter()
              .unpack(ProposalDeleteContract.class);
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(proposalDeleteContract.getOwnerAddress().toByteArray());
          break;
        case ExchangeCreateContract:
          ExchangeCreateContract exchangeCreateContract = contract.getParameter()
              .unpack(ExchangeCreateContract.class);
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(exchangeCreateContract.getOwnerAddress().toByteArray());
          result += "\n";
          result += "firstTokenId: ";
          result += exchangeCreateContract.getFirstTokenId().toStringUtf8();
          result += "\n";
          result += "firstTokenBalance: ";
          result += exchangeCreateContract.getFirstTokenBalance();
          result += "\n";
          result += "secondTokenId: ";
          result += exchangeCreateContract.getSecondTokenId().toStringUtf8();
          result += "\n";
          result += "secondTokenBalance: ";
          result += exchangeCreateContract.getSecondTokenBalance();
          result += "\n";
          break;
        case ExchangeInjectContract:
          ExchangeInjectContract exchangeInjectContract = contract.getParameter()
              .unpack(ExchangeInjectContract.class);
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(exchangeInjectContract.getOwnerAddress().toByteArray());
          result += "\n";
          result += "TokenId: ";
          result += exchangeInjectContract.getTokenId().toStringUtf8();
          result += "\n";
          result += "quant: ";
          result += exchangeInjectContract.getQuant();
          result += "\n";
          break;
        case ExchangeWithdrawContract:
          ExchangeWithdrawContract exchangeWithdrawContract = contract.getParameter()
              .unpack(ExchangeWithdrawContract.class);
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(exchangeWithdrawContract.getOwnerAddress().toByteArray());
          result += "\n";
          result += "TokenId: ";
          result += exchangeWithdrawContract.getTokenId().toStringUtf8();
          result += "\n";
          result += "quant: ";
          result += exchangeWithdrawContract.getQuant();
          result += "\n";
          break;
        case ExchangeTransactionContract:
          ExchangeTransactionContract exchangeTransactionContract = contract.getParameter()
              .unpack(ExchangeTransactionContract.class);
          result += "owner_address: ";
          result += WalletApi
              .encode58Check(exchangeTransactionContract.getOwnerAddress().toByteArray());
          result += "\n";
          result += "TokenId: ";
          result += exchangeTransactionContract.getTokenId().toStringUtf8();
          result += "\n";
          result += "quant: ";
          result += exchangeTransactionContract.getQuant();
          result += "\n";
          break;
        // case BuyStorageContract:
        //   BuyStorageContract buyStorageContract = contract.getParameter()
        //       .unpack(BuyStorageContract.class);
        //   result += "owner_address: ";
        //   result += WalletApi
        //       .encode58Check(buyStorageContract.getOwnerAddress().toByteArray());
        //   result += "\n";
        //   result += "quant:";
        //   result += buyStorageContract.getQuant();
        //   result += "\n";
        //   break;
        // case SellStorageContract:
        //   SellStorageContract sellStorageContract = contract.getParameter()
        //       .unpack(SellStorageContract.class);
        //   result += "owner_address: ";
        //   result += WalletApi
        //       .encode58Check(sellStorageContract.getOwnerAddress().toByteArray());
        //   result += "\n";
        //   result += "storageBytes:";
        //   result += sellStorageContract.getStorageBytes();
        //   result += "\n";
        //   break;
        default:
          return "";
      }
    } catch (Exception ex) {
      ex.printStackTrace();
      return "";
    }
    return result;
  }

  public static String printContractList(List<Contract> contractList) {
    String result = "";
    int i = 0;
    for (Contract contract : contractList) {
      result += "contract " + i + " :::";
      result += "\n";
      result += "[";
      result += "\n";
      result += printContract(contract);
      result += "]";
      result += "\n";
      result += "\n";
      i++;
    }
    return result;
  }

  public static String printTransactionRow(Transaction.raw raw) {
    String result = "";

    if (raw.getRefBlockBytes() != null) {
      result += "ref_block_bytes: ";
      result += ByteArray.toHexString(raw.getRefBlockBytes().toByteArray());
      result += "\n";
    }

    if (raw.getRefBlockHash() != null) {
      result += "ref_block_hash: ";
      result += ByteArray.toHexString(raw.getRefBlockHash().toByteArray());
      result += "\n";
    }

    if (raw.getContractCount() > 0) {
      result += "contract: ";
      result += "\n";
      result += "{";
      result += "\n";
      result += printContractList(raw.getContractList());
      result += "}";
      result += "\n";
    }

    result += "timestamp: ";
    result += new Date(raw.getTimestamp());
    result += "\n";

    result += "fee_limit: ";
    result += raw.getFeeLimit();
    result += "\n";

    return result;
  }

  public static String printSignature(List<ByteString> signatureList) {
    String result = "";
    int i = 0;
    for (ByteString signature : signatureList) {
      result += "signature " + i + " :";
      result += ByteArray.toHexString(signature.toByteArray());
      result += "\n";
      i++;
    }
    return result;
  }

  public static String printRet(List<Result> resultList) {
    String results = "";
    int i = 0;
    for (Result result : resultList) {
      results += "result: ";
      results += i;
      results += " ::: ";
      results += "\n";
      results += "[";
      results += "\n";
      results += "code ::: ";
      results += result.getRet();
      results += "\n";
      results += "fee ::: ";
      results += result.getFee();
      results += "\n";
      results += "ContractRet ::: ";
      results += result.getContractRet().name();
      results += "\n";
      results += "]";
      results += "\n";
      i++;
    }
    return results;
  }

  public static String printTransaction(Transaction transaction) {
    String result = "";
    result += "hash: ";
    result += "\n";
    result += ByteArray.toHexString(Sha256Hash.hash(transaction.toByteArray()));
    result += "\n";
    result += "txid: ";
    result += "\n";
    result += ByteArray.toHexString(Sha256Hash.hash(transaction.getRawData().toByteArray()));
    result += "\n";

    if (transaction.getRawData() != null) {
      result += "raw_data: ";
      result += "\n";
      result += "{";
      result += "\n";
      result += printTransactionRow(transaction.getRawData());
      result += "}";
      result += "\n";
    }
    if (transaction.getSignatureCount() > 0) {
      result += "signature: ";
      result += "\n";
      result += "{";
      result += "\n";
      result += printSignature(transaction.getSignatureList());
      result += "}";
      result += "\n";
    }
    if (transaction.getRetCount() != 0) {
      result += "ret: ";
      result += "\n";
      result += "{";
      result += "\n";
      result += printRet(transaction.getRetList());
      result += "}";
      result += "\n";
    }
    return result;
  }

  public static String printTransaction(TransactionExtention transactionExtention) {
    String result = "";
    result += "txid: ";
    result += "\n";
    result += ByteArray.toHexString(transactionExtention.getTxid().toByteArray());
    result += "\n";

    Transaction transaction = transactionExtention.getTransaction();
    if (transaction.getRawData() != null) {
      result += "raw_data: ";
      result += "\n";
      result += "{";
      result += "\n";
      result += printTransactionRow(transaction.getRawData());
      result += "}";
      result += "\n";
    }
    if (transaction.getSignatureCount() > 0) {
      result += "signature: ";
      result += "\n";
      result += "{";
      result += "\n";
      result += printSignature(transaction.getSignatureList());
      result += "}";
      result += "\n";
    }
    if (transaction.getRetCount() != 0) {
      result += "ret: ";
      result += "\n";
      result += "{";
      result += "\n";
      result += printRet(transaction.getRetList());
      result += "}";
      result += "\n";
    }
    return result;
  }

  public static String printTransactionInfo(TransactionInfo transactionInfo) {
    String result = "";
    result += "txid: ";
    result += "\n";
    result += ByteArray.toHexString(transactionInfo.getId().toByteArray());
    result += "\n";
    result += "fee: ";
    result += "\n";
    result += transactionInfo.getFee();
    result += "\n";
    result += "blockNumber: ";
    result += "\n";
    result += transactionInfo.getBlockNumber();
    result += "\n";
    result += "blockTimeStamp: ";
    result += "\n";
    result += transactionInfo.getBlockTimeStamp();
    result += "\n";
    result += "result: ";
    result += "\n";
    if (transactionInfo.getResult().equals(code.SUCESS)) {
      result += "SUCCESS";
    } else {
      result += "FAILED";
    }
    result += "\n";
    result += "resMessage: ";
    result += "\n";
    result += ByteArray.toStr(transactionInfo.getResMessage().toByteArray());
    result += "\n";
    result += "contractResult: ";
    result += "\n";
    result += ByteArray.toHexString(transactionInfo.getContractResult(0).toByteArray());
    result += "\n";
    result += "contractAddress: ";
    result += "\n";
    result += WalletApi.encode58Check(transactionInfo.getContractAddress().toByteArray());
    result += "\n";
    result += "logList: ";
    result += "\n";
    result += printLogList(transactionInfo.getLogList());
    result += "\n";
    result += "receipt: ";
    result += "\n";
    result += printReceipt(transactionInfo.getReceipt());
    result += "\n";
    if (transactionInfo.getUnfreezeAmount() != 0) {
      result += "UnfreezeAmount: ";
      result += transactionInfo.getUnfreezeAmount();
      result += "\n";
    }
    if (transactionInfo.getWithdrawAmount() != 0) {
      result += "WithdrawAmount: ";
      result += transactionInfo.getWithdrawAmount();
      result += "\n";
    }
    if (transactionInfo.getExchangeReceivedAmount() != 0) {
      result += "ExchangeReceivedAmount: ";
      result += transactionInfo.getExchangeReceivedAmount();
      result += "\n";
    }
    if (transactionInfo.getExchangeInjectAnotherAmount() != 0) {
      result += "ExchangeInjectAnotherAmount: ";
      result += transactionInfo.getExchangeInjectAnotherAmount();
      result += "\n";
    }
    if (transactionInfo.getExchangeWithdrawAnotherAmount() != 0) {
      result += "ExchangeWithdrawAnotherAmount: ";
      result += transactionInfo.getExchangeWithdrawAnotherAmount();
      result += "\n";
    }
    if (transactionInfo.getExchangeId() != 0) {
      result += "ExchangeId: ";
      result += transactionInfo.getExchangeId();
      result += "\n";
    }
    result += "InternalTransactionList: ";
    result += "\n";
    result += printInternalTransactionList(transactionInfo.getInternalTransactionsList());
    result += "\n";
    return result;
  }

  public static String printInternalTransactionList(
      List<InternalTransaction> internalTransactions) {
    StringBuilder result = new StringBuilder("");
    internalTransactions.forEach(internalTransaction -> {
          result.append("[\n");
          result.append("  hash:\n");
          result.append("  " + ByteArray.toHexString(internalTransaction.getHash().toByteArray()));
          result.append("  \n");
          result.append("  caller_address:\n");
          result.append(
              "  " + ByteArray.toHexString(internalTransaction.getCallerAddress().toByteArray()));
          result.append("  \n");
          result.append("  transferTo_address:\n");
          result.append(
              "  " + ByteArray.toHexString(internalTransaction.getTransferToAddress().toByteArray()));
          result.append("  \n");
          result.append("  callValueInfo:\n");
          StringBuilder callValueInfo = new StringBuilder("");

          internalTransaction.getCallValueInfoList().forEach(token -> {
            callValueInfo.append("  [\n");
            callValueInfo.append("    TokenName(Default trx):\n");
            if (null == token.getTokenId() || token.getTokenId().length() == 0) {
              callValueInfo.append("    TRX(SUN)");
            } else {
              callValueInfo.append("    " + token.getTokenId());
            }
            callValueInfo.append("    \n");
            callValueInfo.append("    callValue:\n");
            callValueInfo.append("    " + token.getCallValue());
            callValueInfo.append("  \n");
            callValueInfo.append("  ]\n");
            callValueInfo.append("    \n");
          });
          result.append(callValueInfo);
          result.append("  note:\n");
          result.append("  " + new String(internalTransaction.getNote().toByteArray()));
          result.append("  \n");
          result.append("  rejected:\n");
          result.append("  " + internalTransaction.getRejected());
          result.append("  \n");
          result.append("]\n");
        }
    );

    return result.toString();

  }

  private static String printReceipt(ResourceReceipt receipt) {
    String result = "";
    result += "EnergyUsage: ";
    result += "\n";
    result += receipt.getEnergyUsage();
    result += "\n";
    result += "EnergyFee(SUN): ";
    result += "\n";
    result += receipt.getEnergyFee();
    result += "\n";
    result += "OriginEnergyUsage: ";
    result += "\n";
    result += receipt.getOriginEnergyUsage();
    result += "\n";
    result += "EnergyUsageTotal: ";
    result += "\n";
    result += receipt.getEnergyUsageTotal();
    result += "\n";
    result += "NetUsage: ";
    result += "\n";
    result += receipt.getNetUsage();
    result += "\n";
    result += "NetFee: ";
    result += "\n";
    result += receipt.getNetFee();
    result += "\n";
    return result;
  }

  public static String printLogList(List<Log> logList) {
    StringBuilder result = new StringBuilder("");
    logList.forEach(log -> {
          result.append("address:\n");
          result.append(ByteArray.toHexString(log.getAddress().toByteArray()));
          result.append("\n");
          result.append("data:\n");
          result.append(ByteArray.toHexString(log.getData().toByteArray()));
          result.append("\n");
          result.append("TopicsList\n");
          StringBuilder topics = new StringBuilder("");

          log.getTopicsList().forEach(bytes -> {
            topics.append(ByteArray.toHexString(bytes.toByteArray()));
            topics.append("\n");
          });
          result.append(topics);
        }
    );

    return result.toString();
  }

  public static String printTransactionList(TransactionList transactionList) {
    return printTransactions(transactionList.getTransactionList());
  }

  public static String printTransactionList(TransactionListExtention transactionList) {
    return printTransactionsExt(transactionList.getTransactionList());
  }

  public static String printTransactions(List<Transaction> transactionList) {
    String result = "\n";
    int i = 0;
    for (Transaction transaction : transactionList) {
      result += "transaction " + i + " :::";
      result += "\n";
      result += "[";
      result += "\n";
      result += printTransaction(transaction);
      result += "]";
      result += "\n";
      result += "\n";
      i++;
    }
    return result;
  }

  public static String printTransactionsExt(List<TransactionExtention> transactionList) {
    String result = "\n";
    int i = 0;
    for (TransactionExtention transaction : transactionList) {
      result += "transaction " + i + " :::";
      result += "\n";
      result += "[";
      result += "\n";
      result += printTransaction(transaction);
      result += "]";
      result += "\n";
      result += "\n";
      i++;
    }
    return result;
  }

  public static String printBlockRow(BlockHeader.raw raw) {
    String result = "";

    result += "timestamp: ";
    result += new Date(raw.getTimestamp());
    result += "\n";

    result += "txTrieRoot: ";
    result += ByteArray.toHexString(raw.getTxTrieRoot().toByteArray());
    result += "\n";

    result += "parentHash: ";
    result += ByteArray.toHexString(raw.getParentHash().toByteArray());
    result += "\n";

    result += "number: ";
    result += raw.getNumber();
    result += "\n";

    result += "witness_id: ";
    result += raw.getWitnessId();
    result += "\n";

    result += "witness_address: ";
    result += WalletApi.encode58Check(raw.getWitnessAddress().toByteArray());
    result += "\n";

    result += "version: ";
    result += raw.getVersion();
    result += "\n";

    return result;
  }


  public static String printBlockHeader(BlockHeader blockHeader) {
    String result = "";
    result += "raw_data: ";
    result += "\n";
    result += "{";
    result += "\n";
    result += printBlockRow(blockHeader.getRawData());
    result += "}";
    result += "\n";

    result += "witness_signature: ";
    result += "\n";
    result += ByteArray.toHexString(blockHeader.getWitnessSignature().toByteArray());
    result += "\n";
    return result;
  }

  public static String printBlock(Block block) {
    String result = "\n";
    if (block.getBlockHeader() != null) {
      result += "block_header: ";
      result += "\n";
      result += "{";
      result += "\n";
      result += printBlockHeader(block.getBlockHeader());
      result += "}";
      result += "\n";
    }
    if (block.getTransactionsCount() > 0) {
      result += printTransactions(block.getTransactionsList());
    }
    return result;
  }

  public static String printBlockExtention(BlockExtention blockExtention) {
    String result = "\n";
    if (blockExtention.getBlockid() != null) {
      result += "block_id: ";
      result += "\n";
      result += "{";
      result += "\n";
      result += ByteArray.toHexString(blockExtention.getBlockid().toByteArray());
      result += "\n";
      result += "}";
      result += "\n";
    }
    if (blockExtention.getBlockHeader() != null) {
      result += "block_header: ";
      result += "\n";
      result += "{";
      result += "\n";
      result += printBlockHeader(blockExtention.getBlockHeader());
      result += "}";
      result += "\n";
    }
    if (blockExtention.getTransactionsCount() > 0) {
      result += printTransactionsExt(blockExtention.getTransactionsList());
    }
    return result;
  }

  public static String printBlockList(BlockList blockList) {
    String result = "\n";
    int i = 0;
    for (Block block : blockList.getBlockList()) {
      result += "block " + i + " :::";
      result += "\n";
      result += "[";
      result += "\n";
      result += printBlock(block);
      result += "]";
      result += "\n";
      result += "\n";
      i++;
    }
    return result;
  }

  public static String printBlockList(BlockListExtention blockList) {
    String result = "\n";
    int i = 0;
    for (BlockExtention block : blockList.getBlockList()) {
      result += "block " + i + " :::";
      result += "\n";
      result += "[";
      result += "\n";
      result += printBlockExtention(block);
      result += "]";
      result += "\n";
      result += "\n";
      i++;
    }
    return result;
  }

  public static String printAccountNet(AccountNetMessage accountNet) {
    String result = "";
    result += "free_net_used: ";
    result += accountNet.getFreeNetUsed();
    result += "\n";
    result += "free_net_limit: ";
    result += accountNet.getFreeNetLimit();
    result += "\n";
    result += "net_used: ";
    result += accountNet.getNetUsed();
    result += "\n";
    result += "net_limit: ";
    result += accountNet.getNetLimit();
    result += "\n";
    result += "total_net_limit: ";
    result += accountNet.getTotalNetLimit();
    result += "\n";
    result += "total_net_weight: ";
    result += accountNet.getTotalNetWeight();
    result += "\n";

    if (accountNet.getAssetNetLimitCount() > 0) {
      for (String name : accountNet.getAssetNetLimitMap().keySet()) {
        result += "asset";
        result += "\n";
        result += "{";
        result += "\n";
        result += "  name: ";
        result += name;
        result += "\n";
        result += "  free_asset_net_used: ";
        result += accountNet.getAssetNetUsedMap().get(name);
        result += "\n";
        result += "  free_asset_net_limit: ";
        result += accountNet.getAssetNetLimitMap().get(name);
        result += "\n";
        result += "}";
        result += "\n";
      }
    }
    return result;
  }


  public static String printAccountResourceMessage(AccountResourceMessage accountResourceMessage) {
    String result = "";
    result += "free_net_used: ";
    result += accountResourceMessage.getFreeNetUsed();
    result += "\n";
    result += "free_net_limit: ";
    result += accountResourceMessage.getFreeNetLimit();
    result += "\n";
    result += "net_used: ";
    result += accountResourceMessage.getNetUsed();
    result += "\n";
    result += "net_limit: ";
    result += accountResourceMessage.getNetLimit();
    result += "\n";
    result += "total_net_limit: ";
    result += accountResourceMessage.getTotalNetLimit();
    result += "\n";
    result += "total_net_weight: ";
    result += accountResourceMessage.getTotalNetWeight();
    result += "\n";

    result += "\n";
    result += "EnergyUsed: ";
    result += accountResourceMessage.getEnergyUsed();
    result += "\n";
    result += "EnergyLimit: ";
    result += accountResourceMessage.getEnergyLimit();
    result += "\n";
    result += "TotalEnergyLimit: ";
    result += accountResourceMessage.getTotalEnergyLimit();
    result += "\n";
    result += "TotalEnergyWeight: ";
    result += accountResourceMessage.getTotalEnergyWeight();
    result += "\n";

    if (accountResourceMessage.getAssetNetLimitCount() > 0) {
      for (String name : accountResourceMessage.getAssetNetLimitMap().keySet()) {
        result += "asset";
        result += "\n";
        result += "{";
        result += "\n";
        result += "  name: ";
        result += name;
        result += "\n";
        result += "  free_asset_net_used: ";
        result += accountResourceMessage.getAssetNetUsedMap().get(name);
        result += "\n";
        result += "  free_asset_net_limit: ";
        result += accountResourceMessage.getAssetNetLimitMap().get(name);
        result += "\n";
        result += "}";
        result += "\n";
      }
    }

    return result;
  }


  public static char[] inputPassword(boolean checkStrength) throws IOException {
    char[] password;
    Console cons = System.console();
    while (true) {
      if (cons != null) {
        password = cons.readPassword("password: ");
      } else {
        byte[] passwd0 = new byte[64];
        int len = System.in.read(passwd0, 0, passwd0.length);
        int i;
        for (i = 0; i < len; i++) {
          if (passwd0[i] == 0x09 || passwd0[i] == 0x0A) {
            break;
          }
        }
        byte[] passwd1 = Arrays.copyOfRange(passwd0, 0, i);
        password = StringUtils.byte2Char(passwd1);
        StringUtils.clear(passwd0);
        StringUtils.clear(passwd1);
      }
      if (WalletApi.passwordValid(password)) {
        return password;
      }
      if (!checkStrength) {
        return password;
      }
      StringUtils.clear(password);
      System.out.println("Invalid password, please input again.");
    }
  }
}
