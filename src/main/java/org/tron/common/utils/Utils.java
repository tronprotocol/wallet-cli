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

import static org.apache.commons.lang3.StringUtils.EMPTY;
import static org.apache.commons.lang3.StringUtils.isEmpty;
import static org.apache.commons.lang3.StringUtils.isNoneBlank;
import static org.tron.common.utils.ByteArray.toHexString;
import static org.tron.common.utils.DomainValidator.isDomainOrIP;
import static org.tron.core.manager.TxHistoryManager.DASH;
import static org.tron.keystore.StringUtils.byte2String;
import static org.tron.ledger.console.ConsoleColor.ANSI_BLUE;
import static org.tron.ledger.console.ConsoleColor.ANSI_BOLD;
import static org.tron.ledger.console.ConsoleColor.ANSI_GREEN;
import static org.tron.ledger.console.ConsoleColor.ANSI_RED;
import static org.tron.ledger.console.ConsoleColor.ANSI_RESET;
import static org.tron.ledger.console.ConsoleColor.ANSI_YELLOW;
import static org.tron.walletserver.WalletApi.encode58Check;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.google.protobuf.Any;
import com.google.protobuf.InvalidProtocolBufferException;
import com.google.protobuf.Message;
import com.typesafe.config.Config;
import java.io.ByteArrayOutputStream;
import java.io.Console;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Scanner;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.apache.commons.lang3.tuple.Triple;
import org.bouncycastle.util.encoders.Hex;
import org.jetbrains.annotations.Nullable;
import org.tron.api.GrpcAPI.BlockExtention;
import org.tron.api.GrpcAPI.BlockList;
import org.tron.api.GrpcAPI.BlockListExtention;
import org.tron.api.GrpcAPI.TransactionExtention;
import org.tron.api.GrpcAPI.TransactionInfoList;
import org.tron.api.GrpcAPI.TransactionList;
import org.tron.api.GrpcAPI.TransactionListExtention;
import org.tron.api.GrpcAPI.TransactionSignWeight;
import org.tron.common.crypto.Hash;
import org.tron.common.crypto.Sha256Sm3Hash;
import org.tron.common.enums.NetType;
import org.tron.core.dao.Tx;
import org.tron.keystore.StringUtils;
import org.tron.keystore.WalletFile;
import org.tron.ledger.wrapper.DebugConfig;
import org.tron.protos.Protocol;
import org.tron.protos.Protocol.Block;
import org.tron.protos.Protocol.TransactionInfo;
import org.tron.protos.contract.AccountContract.AccountCreateContract;
import org.tron.protos.contract.AccountContract.AccountPermissionUpdateContract;
import org.tron.protos.contract.AccountContract.AccountUpdateContract;
import org.tron.protos.contract.AccountContract.SetAccountIdContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.AssetIssueContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.ParticipateAssetIssueContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.TransferAssetContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.UnfreezeAssetContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.UpdateAssetContract;
import org.tron.protos.contract.BalanceContract;
import org.tron.protos.contract.BalanceContract.CancelAllUnfreezeV2Contract;
import org.tron.protos.contract.BalanceContract.FreezeBalanceContract;
import org.tron.protos.contract.BalanceContract.TransferContract;
import org.tron.protos.contract.BalanceContract.UnfreezeBalanceContract;
import org.tron.protos.contract.BalanceContract.WithdrawBalanceContract;
import org.tron.protos.contract.ExchangeContract.ExchangeCreateContract;
import org.tron.protos.contract.ExchangeContract.ExchangeInjectContract;
import org.tron.protos.contract.ExchangeContract.ExchangeTransactionContract;
import org.tron.protos.contract.ExchangeContract.ExchangeWithdrawContract;
import org.tron.protos.contract.MarketContract.MarketCancelOrderContract;
import org.tron.protos.contract.MarketContract.MarketSellAssetContract;
import org.tron.protos.contract.ProposalContract.ProposalApproveContract;
import org.tron.protos.contract.ProposalContract.ProposalCreateContract;
import org.tron.protos.contract.ProposalContract.ProposalDeleteContract;
import org.tron.protos.contract.ShieldContract.ShieldedTransferContract;
import org.tron.protos.contract.SmartContractOuterClass.ClearABIContract;
import org.tron.protos.contract.SmartContractOuterClass.CreateSmartContract;
import org.tron.protos.contract.SmartContractOuterClass.TriggerSmartContract;
import org.tron.protos.contract.SmartContractOuterClass.UpdateEnergyLimitContract;
import org.tron.protos.contract.SmartContractOuterClass.UpdateSettingContract;
import org.tron.protos.contract.StorageContract.UpdateBrokerageContract;
import org.tron.protos.contract.VoteAssetContractOuterClass.VoteAssetContract;
import org.tron.protos.contract.WitnessContract.VoteWitnessContract;
import org.tron.protos.contract.WitnessContract.WitnessCreateContract;
import org.tron.protos.contract.WitnessContract.WitnessUpdateContract;
import org.tron.trident.proto.Chain;
import org.tron.trident.proto.Response;
import org.tron.walletcli.Client;
import org.tron.walletserver.WalletApi;

public class Utils {
  public static final String PERMISSION_ID = "Permission_id";
  public static final String VISIBLE = "visible";
  public static final String TRANSACTION = "transaction";
  public static final String VALUE = "value";
  public static final String EMPTY_STR = "EMPTY";
  public static final String HOST_REGEX = "^([a-zA-Z0-9.-]+):(\\d{1,5})$";
  public static final String LOCK_WARNING = "⚠️" + ANSI_YELLOW
      + " Wallet is locked. Transaction not allowed. Please use " + greenBoldHighlight("unlock")
      + ANSI_YELLOW + " to retry" + ANSI_RESET;

  public static final int MIN_LENGTH = 2;
  public static final int MAX_LENGTH = 14;
  public static final String VERSION = " v4.9.4";
  public static final String TRANSFER_METHOD_ID = "a9059cbb";

  private static SecureRandom random = new SecureRandom();

  public static SecureRandom getRandom() {
    return random;
  }

  public static byte[] getBytes(char[] chars) {
    Charset cs = StandardCharsets.UTF_8;
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

  /** yyyy-MM-dd */
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

  public static String formatMessageString(Message message) {
    String result = JsonFormat.printToString(message, true);
    return JsonFormatUtil.formatJson(result);
  }

  public static String printTransactionExceptId(Chain.Transaction transaction)
      throws InvalidProtocolBufferException {
    JSONObject jsonObject = printTransactionToJSON(transaction, true);
    jsonObject.remove("txID");
    return JsonFormatUtil.formatJson(jsonObject.toJSONString());
  }

  public static String printTransactionExceptId(Protocol.Transaction transaction) {
    JSONObject jsonObject = printTransactionToJSON(transaction, true);
    jsonObject.remove("txID");
    return JsonFormatUtil.formatJson(jsonObject.toJSONString());
  }

  public static String printTransaction(Protocol.Transaction transaction) {
    String result = printTransactionToJSON(transaction, true).toJSONString();
    return JsonFormatUtil.formatJson(result);
  }

  public static String printTransaction(Chain.Transaction transaction)
      throws InvalidProtocolBufferException {
    return printTransaction(Protocol.Transaction.parseFrom(transaction.toByteArray()));
  }

  public static String printTransaction(TransactionExtention transactionExtention) {
    JSONObject jsonObject = printTransactionExtentionToJSON(transactionExtention);
    return JsonFormatUtil.formatJson(jsonObject.toJSONString());
  }

  public static String printTransactionList(TransactionList transactionList) {
    JSONArray jsonArray = new JSONArray();
    List<Protocol.Transaction> transactions = transactionList.getTransactionList();
    transactions
        .forEach(
            transaction -> {
              jsonArray.add(printTransactionToJSON(transaction, true));
            });
    return JsonFormatUtil.formatJson(jsonArray.toJSONString());
  }

  public static String printTransactionInfoList(Response.TransactionInfoList transactionInfoList) throws InvalidProtocolBufferException {
    return printTransactionInfoList(TransactionInfoList.parseFrom(transactionInfoList.toByteArray()));
  }

  public static String printTransactionInfoList(TransactionInfoList transactionInfoList) {
    JSONArray jsonArray = new JSONArray();
    List<TransactionInfo> infoList = transactionInfoList.getTransactionInfoList();
    infoList.forEach(transactionInfo -> jsonArray.add(printTransactionInfoToJSON(transactionInfo)));
    return JsonFormatUtil.formatJson(jsonArray.toJSONString());
  }

  public static String printTransactionList(TransactionListExtention transactionList) {
    JSONArray jsonArray = new JSONArray();
    List<TransactionExtention> transactions = transactionList.getTransactionList();
    transactions
        .forEach(
            transaction -> jsonArray.add(printTransactionExtentionToJSON(transaction)));
    return JsonFormatUtil.formatJson(jsonArray.toJSONString());
  }

  public static String printBlock(Block block) {
    JSONObject jsonObject = printBlockToJSON(block);
    return JsonFormatUtil.formatJson(jsonObject.toJSONString());
  }

  public static String printBlock(Chain.Block block) throws InvalidProtocolBufferException {
    return printBlock(Block.parseFrom(block.toByteArray()));
  }

  public static String printBlockExtention(BlockExtention blockExtention) {
    JSONObject jsonObject = printBlockExtentionToJSON(blockExtention);
    return JsonFormatUtil.formatJson(jsonObject.toJSONString());
  }

  public static String printBlockExtention(Response.BlockExtention blockExtention) throws InvalidProtocolBufferException {
    return printBlockExtention(BlockExtention.parseFrom(blockExtention.toByteArray()));
  }

  public static String printBlockList(BlockList blockList) {
    JSONArray jsonArray = new JSONArray();
    List<Block> blocks = blockList.getBlockList();
    blocks.forEach(block -> jsonArray.add(printBlockToJSON(block)));
    return JsonFormatUtil.formatJson(jsonArray.toJSONString());
  }

  public static String printBlockList(BlockListExtention blockList) {
    JSONArray jsonArray = new JSONArray();
    List<BlockExtention> blocks = blockList.getBlockList();
    blocks.forEach(block -> jsonArray.add(printBlockExtentionToJSON(block)));
    return JsonFormatUtil.formatJson(jsonArray.toJSONString());
  }

  public static String printBlockList(Response.BlockListExtention blockList) throws InvalidProtocolBufferException {
    return printBlockList(BlockListExtention.parseFrom(blockList.toByteArray()));
  }

  public static String printTransactionSignWeight(TransactionSignWeight transactionSignWeight) {
    String string = JsonFormat.printToString(transactionSignWeight, true);
    JSONObject jsonObject = JSON.parseObject(string);
    JSONObject jsonObjectExt = jsonObject.getJSONObject(TRANSACTION);
    jsonObjectExt.put(
        TRANSACTION,
        printTransactionToJSON(transactionSignWeight.getTransaction().getTransaction(), true));
    jsonObject.put(TRANSACTION, jsonObjectExt);
    return JsonFormatUtil.formatJson(jsonObject.toJSONString());
  }

  public static String printTransactionSignWeight(Response.TransactionSignWeight transactionSignWeight)
      throws InvalidProtocolBufferException {
    return printTransactionSignWeight(TransactionSignWeight.parseFrom(transactionSignWeight.toByteArray()));
  }

  public static String printTransactionApprovedList(
      Response.TransactionApprovedList transactionApprovedList) throws InvalidProtocolBufferException {
    String string = JsonFormat.printToString(transactionApprovedList, true);
    JSONObject jsonObject = JSON.parseObject(string);
    JSONObject jsonObjectExt = jsonObject.getJSONObject(TRANSACTION);
    jsonObjectExt.put(
        TRANSACTION,
        printTransactionToJSON(transactionApprovedList.getTransaction().getTransaction(), true));
    jsonObject.put(TRANSACTION, jsonObjectExt);
    return JsonFormatUtil.formatJson(jsonObject.toJSONString());
  }

  public static char[] inputPassword2Twice(boolean isNew) throws IOException {
    char[] password0;
    String newStr = isNew ? "new" : EMPTY;
    while (true) {
      System.out.println("Please input " + newStr + "password.");
      password0 = Utils.inputPassword(true);
      System.out.println("Please input " + newStr + "password again.");
      char[] password1 = Utils.inputPassword(true);
      boolean flag = Arrays.equals(password0, password1);
      StringUtils.clear(password1);
      if (flag) {
        break;
      }
      System.out.println("The passwords do not match, please input again.");
    }
    return password0;
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

  public static char[] inputPasswordWithoutCheck() throws IOException {
    char[] password;
    Console cons = System.console();
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
    return password;
  }

  public static byte[] generateContractAddress(Protocol.Transaction trx, byte[] ownerAddress) {
    // get tx hash
    byte[] txRawDataHash = Sha256Sm3Hash.of(trx.getRawData().toByteArray()).getBytes();

    // combine
    byte[] combined = new byte[txRawDataHash.length + ownerAddress.length];
    System.arraycopy(txRawDataHash, 0, combined, 0, txRawDataHash.length);
    System.arraycopy(ownerAddress, 0, combined, txRawDataHash.length, ownerAddress.length);

    return Hash.sha3omit12(combined);
  }

  public static byte[] generateContractAddress(Chain.Transaction trx, byte[] ownerAddress)
      throws InvalidProtocolBufferException {
    return generateContractAddress(Protocol.Transaction.parseFrom(trx.toByteArray()), ownerAddress);
  }

  public static JSONObject printBlockExtentionToJSON(BlockExtention blockExtention) {
    JSONObject jsonObject = JSON.parseObject(JsonFormat.printToString(blockExtention, true));
    if (blockExtention.getTransactionsCount() > 0) {
      JSONArray jsonArray = new JSONArray();
      List<TransactionExtention> transactions = blockExtention.getTransactionsList();
      transactions
          .forEach(
              transaction -> jsonArray.add(printTransactionExtentionToJSON(transaction)));
      jsonObject.put(TRANSACTION, jsonArray);
    }
    return jsonObject;
  }

  public static JSONObject printBlockToJSON(Block block) {
    JSONObject jsonObject = JSON.parseObject(JsonFormat.printToString(block, true));
    if (block.getTransactionsCount() > 0) {
      JSONArray jsonArray = new JSONArray();
      List<Protocol.Transaction> transactions = block.getTransactionsList();
      transactions
          .forEach(
              transaction -> jsonArray.add(printTransactionToJSON(transaction, true)));
      jsonObject.put(TRANSACTION, jsonArray);
    }
    return jsonObject;
  }

  public static JSONObject printTransactionExtentionToJSON(
      TransactionExtention transactionExtention) {
    JSONObject jsonObject =
        JSON.parseObject(JsonFormat.printToString(transactionExtention, true));
    if (transactionExtention.getResult().getResult()) {
      JSONObject transactionObject =
          printTransactionToJSON(transactionExtention.getTransaction(), true);
      jsonObject.put(TRANSACTION, transactionObject);
    }
    return jsonObject;
  }

  public static JSONObject printTransactionToJSON(Chain.Transaction transaction, boolean selfType)
      throws InvalidProtocolBufferException {
    return printTransactionToJSON(Protocol.Transaction.parseFrom(transaction.toByteArray()), selfType);
  }

  public static Tx getTx(Chain.Transaction transaction) {
    Tx tx = new Tx();
    transaction.getRawData().getContractList().forEach(contract -> {
      try {
        Any contractParameter = contract.getParameter();
        switch (contract.getType()) {
          case AccountCreateContract:
            AccountCreateContract accountCreateContract =
                contractParameter.unpack(AccountCreateContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(accountCreateContract.getOwnerAddress().toByteArray()));
            tx.setTo(encode58Check(accountCreateContract.getAccountAddress().toByteArray()));
            break;
          case TransferContract:
            TransferContract transferContract =
                contractParameter.unpack(TransferContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(transferContract.getOwnerAddress().toByteArray()));
            tx.setTo(encode58Check(transferContract.getToAddress().toByteArray()));
            tx.setAmount(String.valueOf(transferContract.getAmount()));
            break;
          case TransferAssetContract:
            TransferAssetContract transferAssetContract =
                contractParameter.unpack(TransferAssetContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(transferAssetContract.getOwnerAddress().toByteArray()));
            tx.setTo(encode58Check(transferAssetContract.getToAddress().toByteArray()));
            tx.setAmount(String.valueOf(transferAssetContract.getAmount()));
            tx.setNote(byte2String(transferAssetContract.getAssetName().toByteArray()));
            break;
          case VoteAssetContract:
            VoteAssetContract voteAssetContract =
                contractParameter.unpack(VoteAssetContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(voteAssetContract.getOwnerAddress().toByteArray()));
//            tx.setNote(
//                "voteAddress: "
//                    + voteAssetContract.getVoteAddressList().stream()
//                    .map(o -> encode58Check(o.toByteArray())).collect(Collectors.toList())
//                    + "; support: " + voteAssetContract.getSupport()
//                    + "; count: " + voteAssetContract.getCount()
//            );
            break;
          case VoteWitnessContract:
            VoteWitnessContract voteWitnessContract =
                contractParameter.unpack(VoteWitnessContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(voteWitnessContract.getOwnerAddress().toByteArray()));
//            tx.setNote("voteAddress: "
//                + voteWitnessContract.getVotesList().stream()
//                .map(o -> encode58Check(o.getVoteAddress().toByteArray())).collect(Collectors.toList())
//                + "; support: " + voteWitnessContract.getSupport());
            break;
          case WitnessCreateContract:
            WitnessCreateContract witnessCreateContract =
                contractParameter.unpack(WitnessCreateContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(witnessCreateContract.getOwnerAddress().toByteArray()));
            tx.setNote(byte2String(witnessCreateContract.getUrl().toByteArray()));
            break;
          case AssetIssueContract:
            AssetIssueContract assetIssueContract =
                contractParameter.unpack(AssetIssueContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(assetIssueContract.getOwnerAddress().toByteArray()));
            tx.setNote(byte2String(assetIssueContract.getName().toByteArray()));
            break;
          case WitnessUpdateContract:
            WitnessUpdateContract witnessUpdateContract =
                contractParameter.unpack(WitnessUpdateContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(witnessUpdateContract.getOwnerAddress().toByteArray()));
            tx.setNote(byte2String(witnessUpdateContract.getUpdateUrl().toByteArray()));
            break;
          case ParticipateAssetIssueContract:
            ParticipateAssetIssueContract participateAssetIssueContract =
                contractParameter.unpack(ParticipateAssetIssueContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(participateAssetIssueContract.getOwnerAddress().toByteArray()));
            tx.setTo(encode58Check(participateAssetIssueContract.getToAddress().toByteArray()));
            tx.setAmount(String.valueOf(participateAssetIssueContract.getAmount()));
            tx.setNote(byte2String(participateAssetIssueContract.getAssetName().toByteArray()));
            break;
          case AccountUpdateContract:
            AccountUpdateContract accountUpdateContract =
                contractParameter.unpack(AccountUpdateContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(accountUpdateContract.getOwnerAddress().toByteArray()));
            tx.setNote(byte2String(accountUpdateContract.getAccountName().toByteArray()));
            break;
          case FreezeBalanceContract:
            FreezeBalanceContract freezeBalanceContract =
                contractParameter.unpack(FreezeBalanceContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(freezeBalanceContract.getOwnerAddress().toByteArray()));
            tx.setTo(encode58Check(freezeBalanceContract.getReceiverAddress().toByteArray()));
            tx.setAmount(String.valueOf(freezeBalanceContract.getFrozenBalance()));
            tx.setNote(freezeBalanceContract.getResource().name());
            break;
          case UnfreezeBalanceContract:
            UnfreezeBalanceContract unfreezeBalanceContract =
                contractParameter.unpack(UnfreezeBalanceContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(unfreezeBalanceContract.getOwnerAddress().toByteArray()));
            tx.setTo(encode58Check(unfreezeBalanceContract.getReceiverAddress().toByteArray()));
            tx.setNote(unfreezeBalanceContract.getResource().name());
            break;
          case WithdrawBalanceContract:
            WithdrawBalanceContract withdrawBalanceContract =
                contractParameter.unpack(WithdrawBalanceContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(withdrawBalanceContract.getOwnerAddress().toByteArray()));
            break;
          case UnfreezeAssetContract:
            UnfreezeAssetContract unfreezeAssetContract =
                contractParameter.unpack(UnfreezeAssetContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(unfreezeAssetContract.getOwnerAddress().toByteArray()));
            break;
          case UpdateAssetContract:
            UpdateAssetContract updateAssetContract =
                contractParameter.unpack(UpdateAssetContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(updateAssetContract.getOwnerAddress().toByteArray()));
            tx.setNote(byte2String(updateAssetContract.getUrl().toByteArray())
                + "; " + byte2String(updateAssetContract.getDescription().toByteArray()));
            break;
          case ProposalCreateContract:
            ProposalCreateContract proposalCreateContract =
                contractParameter.unpack(ProposalCreateContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(proposalCreateContract.getOwnerAddress().toByteArray()));
            tx.setNote(proposalCreateContract.getParametersMap().entrySet().stream()
                .map(entry -> entry.getKey() + ":" + entry.getValue())
                .collect(Collectors.joining("; ")));
            break;
          case ProposalApproveContract:
            ProposalApproveContract proposalApproveContract =
                contractParameter.unpack(ProposalApproveContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(proposalApproveContract.getOwnerAddress().toByteArray()));
            tx.setNote("proposalId: " + proposalApproveContract.getProposalId()
                + "; isAddApproval: " + proposalApproveContract.getIsAddApproval());
            break;
          case ProposalDeleteContract:
            ProposalDeleteContract proposalDeleteContract =
                contractParameter.unpack(ProposalDeleteContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(proposalDeleteContract.getOwnerAddress().toByteArray()));
            tx.setNote("proposalId: " + proposalDeleteContract.getProposalId());
            break;
          case SetAccountIdContract:
            SetAccountIdContract setAccountIdContract =
                contractParameter.unpack(
                    SetAccountIdContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(setAccountIdContract.getOwnerAddress().toByteArray()));
            tx.setNote(byte2String(setAccountIdContract.getAccountId().toByteArray()));
            break;
          case CreateSmartContract:
            CreateSmartContract deployContract =
                contractParameter.unpack(CreateSmartContract.class);
            byte[] ownerAddress = deployContract.getOwnerAddress().toByteArray();
            byte[] contractAddress = generateContractAddress(transaction, ownerAddress);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(deployContract.getOwnerAddress().toByteArray()));
            tx.setTo(encode58Check(contractAddress));
            break;
          case TriggerSmartContract:
            TriggerSmartContract triggerSmartContract =
                contractParameter.unpack(TriggerSmartContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(triggerSmartContract.getOwnerAddress().toByteArray()));
            tx.setTo(encode58Check(triggerSmartContract.getContractAddress().toByteArray()));
            NetType netType = WalletApi.getCurrentNetwork();
            if (org.apache.commons.lang3.StringUtils.equals(netType.getUsdtAddress(), encode58Check(triggerSmartContract.getContractAddress().toByteArray()))) {
              setTransferParams(tx, triggerSmartContract);
              tx.setType(contract.getType().name() + "(transferUSDT)");
            }
            break;
          case UpdateSettingContract:
            UpdateSettingContract updateSettingContract =
                contractParameter.unpack(UpdateSettingContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(updateSettingContract.getOwnerAddress().toByteArray()));
            tx.setTo(encode58Check(updateSettingContract.getContractAddress().toByteArray()));
            tx.setNote("consumeUserResourcePercent: " + updateSettingContract.getConsumeUserResourcePercent());
            break;
          case ExchangeCreateContract:
            ExchangeCreateContract exchangeCreateContract =
                contractParameter.unpack(ExchangeCreateContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(exchangeCreateContract.getOwnerAddress().toByteArray()));
            tx.setNote(
                "firstTokenId: "
                    + byte2String(exchangeCreateContract.getFirstTokenId().toByteArray())
                    + "; firstTokenBalance: "
                    + exchangeCreateContract.getFirstTokenBalance()
                    + "; secondTokenId: "
                    + byte2String(exchangeCreateContract.getSecondTokenId().toByteArray())
                    + "; second_token_balance: "
                    + exchangeCreateContract.getSecondTokenBalance()
            );
            break;
          case ExchangeInjectContract:
            ExchangeInjectContract exchangeInjectContract =
                contractParameter.unpack(ExchangeInjectContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(exchangeInjectContract.getOwnerAddress().toByteArray()));
            tx.setNote("exchangeId: "
                + exchangeInjectContract.getExchangeId()
                + "; tokenId: "
                + byte2String(exchangeInjectContract.getTokenId().toByteArray())
                + "; quant: "
                + exchangeInjectContract.getQuant());
            break;
          case ExchangeWithdrawContract:
            ExchangeWithdrawContract exchangeWithdrawContract =
                contractParameter.unpack(ExchangeWithdrawContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(exchangeWithdrawContract.getOwnerAddress().toByteArray()));
            tx.setNote("exchangeId: "
                + exchangeWithdrawContract.getExchangeId()
                + "; tokenId: "
                + byte2String(exchangeWithdrawContract.getTokenId().toByteArray())
                + "; quant: "
                + exchangeWithdrawContract.getQuant());
            break;
          case ExchangeTransactionContract:
            ExchangeTransactionContract exchangeTransactionContract =
                contractParameter.unpack(ExchangeTransactionContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(exchangeTransactionContract.getOwnerAddress().toByteArray()));
            tx.setNote("exchangeId: "
                + exchangeTransactionContract.getExchangeId()
                + "; tokenId: "
                + byte2String(exchangeTransactionContract.getTokenId().toByteArray())
                + "; quant: "
                + exchangeTransactionContract.getQuant()
                + "; expected: "
                + exchangeTransactionContract.getExpected());
            break;
          case UpdateEnergyLimitContract:
            UpdateEnergyLimitContract updateEnergyLimitContract =
                contractParameter.unpack(UpdateEnergyLimitContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(updateEnergyLimitContract.getOwnerAddress().toByteArray()));
            tx.setTo(encode58Check(updateEnergyLimitContract.getContractAddress().toByteArray()));
            tx.setNote("originEnergyLimit: " + updateEnergyLimitContract.getOriginEnergyLimit());
            break;
          case AccountPermissionUpdateContract:
            AccountPermissionUpdateContract accountPermissionUpdateContract =
                contractParameter.unpack(AccountPermissionUpdateContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(accountPermissionUpdateContract.getOwnerAddress().toByteArray()));
            break;
          case ClearABIContract:
            ClearABIContract clearABIContract =
                contractParameter.unpack(ClearABIContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(clearABIContract.getOwnerAddress().toByteArray()));
            tx.setTo(encode58Check(clearABIContract.getContractAddress().toByteArray()));
            break;
          case UpdateBrokerageContract:
            UpdateBrokerageContract updateBrokerageContract =
                contract.getParameter().unpack(UpdateBrokerageContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(updateBrokerageContract.getOwnerAddress().toByteArray()));
            tx.setNote("brokerage: " + updateBrokerageContract.getBrokerage());
            break;
          case MarketSellAssetContract:
            MarketSellAssetContract marketSellAssetContract = contract.getParameter()
                .unpack(MarketSellAssetContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(marketSellAssetContract.getOwnerAddress().toByteArray()));
            tx.setNote("sellTokenId: "
                + byte2String(marketSellAssetContract.getSellTokenId().toByteArray())
                + "; sellTokenQuantity: "
                + marketSellAssetContract.getSellTokenQuantity()
                + "; buyTokenId: "
                + byte2String(marketSellAssetContract.getBuyTokenId().toByteArray())
                + "; buyTokenQuantity: "
                + marketSellAssetContract.getBuyTokenQuantity());
            break;
          case MarketCancelOrderContract:
            MarketCancelOrderContract marketCancelOrderContract = contract.getParameter()
                .unpack(MarketCancelOrderContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(marketCancelOrderContract.getOwnerAddress().toByteArray()));
            tx.setNote("orderId: " + toHexString(marketCancelOrderContract.getOrderId().toByteArray()));
            break;
          // new freeze begin
          case FreezeBalanceV2Contract:
            BalanceContract.FreezeBalanceV2Contract freezeBalanceV2Contract =
                contractParameter.unpack(BalanceContract.FreezeBalanceV2Contract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(freezeBalanceV2Contract.getOwnerAddress().toByteArray()));
            tx.setAmount(String.valueOf(freezeBalanceV2Contract.getFrozenBalance()));
            tx.setNote(freezeBalanceV2Contract.getResource().name());
            break;
          case UnfreezeBalanceV2Contract:
            BalanceContract.UnfreezeBalanceV2Contract unfreezeBalanceV2Contract =
                contractParameter.unpack(BalanceContract.UnfreezeBalanceV2Contract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(unfreezeBalanceV2Contract.getOwnerAddress().toByteArray()));
            tx.setAmount(String.valueOf(unfreezeBalanceV2Contract.getUnfreezeBalance()));
            tx.setNote(unfreezeBalanceV2Contract.getResource().name());
            break;
          case WithdrawExpireUnfreezeContract:
            BalanceContract.WithdrawExpireUnfreezeContract withdrawExpireUnfreezeContract =
                contractParameter.unpack(BalanceContract.WithdrawExpireUnfreezeContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(withdrawExpireUnfreezeContract.getOwnerAddress().toByteArray()));
            break;
          case DelegateResourceContract:
            BalanceContract.DelegateResourceContract delegateResourceContract =
                contractParameter.unpack(BalanceContract.DelegateResourceContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(delegateResourceContract.getOwnerAddress().toByteArray()));
            tx.setTo(encode58Check(delegateResourceContract.getReceiverAddress().toByteArray()));
            tx.setAmount(String.valueOf(delegateResourceContract.getBalance()));
            tx.setNote("resource: "
                + delegateResourceContract.getResource().name()
                + "; lock: "
                + delegateResourceContract.getLock()
                + "; lockPeriod: "
                + delegateResourceContract.getLockPeriod());
            break;
          case UnDelegateResourceContract:
            BalanceContract.UnDelegateResourceContract unDelegateResourceContract =
                contractParameter.unpack(BalanceContract.UnDelegateResourceContract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(unDelegateResourceContract.getOwnerAddress().toByteArray()));
            tx.setTo(encode58Check(unDelegateResourceContract.getReceiverAddress().toByteArray()));
            tx.setAmount(String.valueOf(unDelegateResourceContract.getBalance()));
            tx.setNote(unDelegateResourceContract.getResource().name());
            break;
          case CancelAllUnfreezeV2Contract:
            CancelAllUnfreezeV2Contract cancelAllUnfreezeV2Contract =
                contractParameter.unpack(CancelAllUnfreezeV2Contract.class);
            tx.setType(contract.getType().name());
            tx.setFrom(encode58Check(cancelAllUnfreezeV2Contract.getOwnerAddress().toByteArray()));
            break;
          default:
        }
      } catch (InvalidProtocolBufferException e) {
        e.printStackTrace();
      }
    });
    return tx;
  }

  private static void setTransferParams(Tx tx, TriggerSmartContract triggerSmartContract) {
    try {
      byte[] data = triggerSmartContract.getData().toByteArray();
      byte[] methodId = Arrays.copyOfRange(data, 0, 4);
      if (TRANSFER_METHOD_ID.equals(Hex.toHexString(methodId))) {
        byte[] toBytes = Arrays.copyOfRange(data, 4, 36);
        byte[] addressBytes = Arrays.copyOfRange(toBytes, 12, 32);
        byte[] tronAddressBytes = new byte[21];
        tronAddressBytes[0] = 0x41;
        System.arraycopy(addressBytes, 0, tronAddressBytes, 1, 20);
        String to = encode58Check(tronAddressBytes);
        byte[] amountBytes = Arrays.copyOfRange(data, 36, 68);
        tx.setTo(to);
        tx.setAmount(parseAmountToLongStr(amountBytes));
      }
    } catch (Exception e) {
      System.out.println(e.getMessage());
    }
  }

  public static String parseAmountToLongStr(byte[] amountBytes) {
    BigInteger amount = new BigInteger(1, amountBytes);
    if (amount.compareTo(BigInteger.valueOf(Long.MAX_VALUE)) > 0) {
      System.out.println("Amount exceeds long capacity: " + amount);
      return DASH;
    }
    return String.valueOf(amount.longValue());
  }

  public static JSONObject printTransactionToJSON(Protocol.Transaction transaction, boolean selfType) {
    JSONObject jsonTransaction =
        JSON.parseObject(JsonFormat.printToString(transaction, selfType));
    JSONArray contracts = new JSONArray();
    transaction.getRawData().getContractList()
        .forEach(
            contract -> {
              try {
                JSONObject contractJson = null;
                Any contractParameter = contract.getParameter();
                switch (contract.getType()) {
                  case AccountCreateContract:
                    AccountCreateContract accountCreateContract =
                        contractParameter.unpack(AccountCreateContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(accountCreateContract, selfType));
                    break;
                  case TransferContract:
                    TransferContract transferContract =
                        contractParameter.unpack(TransferContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(transferContract, selfType));
                    break;
                  case TransferAssetContract:
                    TransferAssetContract transferAssetContract =
                        contractParameter.unpack(TransferAssetContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(transferAssetContract, selfType));
                    break;
                  case VoteAssetContract:
                    VoteAssetContract voteAssetContract =
                        contractParameter.unpack(VoteAssetContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(voteAssetContract, selfType));
                    break;
                  case VoteWitnessContract:
                    VoteWitnessContract voteWitnessContract =
                        contractParameter.unpack(VoteWitnessContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(voteWitnessContract, selfType));
                    break;
                  case WitnessCreateContract:
                    WitnessCreateContract witnessCreateContract =
                        contractParameter.unpack(WitnessCreateContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(witnessCreateContract, selfType));
                    break;
                  case AssetIssueContract:
                    AssetIssueContract assetIssueContract =
                        contractParameter.unpack(AssetIssueContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(assetIssueContract, selfType));
                    break;
                  case WitnessUpdateContract:
                    WitnessUpdateContract witnessUpdateContract =
                        contractParameter.unpack(WitnessUpdateContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(witnessUpdateContract, selfType));
                    break;
                  case ParticipateAssetIssueContract:
                    ParticipateAssetIssueContract participateAssetIssueContract =
                        contractParameter.unpack(ParticipateAssetIssueContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(participateAssetIssueContract, selfType));
                    break;
                  case AccountUpdateContract:
                    AccountUpdateContract accountUpdateContract =
                        contractParameter.unpack(AccountUpdateContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(accountUpdateContract, selfType));
                    break;
                  case FreezeBalanceContract:
                    FreezeBalanceContract freezeBalanceContract =
                        contractParameter.unpack(FreezeBalanceContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(freezeBalanceContract, selfType));
                    break;
                  case UnfreezeBalanceContract:
                    UnfreezeBalanceContract unfreezeBalanceContract =
                        contractParameter.unpack(UnfreezeBalanceContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(unfreezeBalanceContract, selfType));
                    break;
                  case WithdrawBalanceContract:
                    WithdrawBalanceContract withdrawBalanceContract =
                        contractParameter.unpack(WithdrawBalanceContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(withdrawBalanceContract, selfType));
                    break;
                  case UnfreezeAssetContract:
                    UnfreezeAssetContract unfreezeAssetContract =
                        contractParameter.unpack(UnfreezeAssetContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(unfreezeAssetContract, selfType));
                    break;
                  case UpdateAssetContract:
                    UpdateAssetContract updateAssetContract =
                        contractParameter.unpack(UpdateAssetContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(updateAssetContract, selfType));
                    break;
                  case ProposalCreateContract:
                    ProposalCreateContract proposalCreateContract =
                        contractParameter.unpack(ProposalCreateContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(proposalCreateContract, selfType));
                    break;
                  case ProposalApproveContract:
                    ProposalApproveContract proposalApproveContract =
                        contractParameter.unpack(ProposalApproveContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(proposalApproveContract, selfType));
                    break;
                  case ProposalDeleteContract:
                    ProposalDeleteContract proposalDeleteContract =
                        contractParameter.unpack(ProposalDeleteContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(proposalDeleteContract, selfType));
                    break;
                  case SetAccountIdContract:
                    SetAccountIdContract setAccountIdContract =
                        contractParameter.unpack(
                            SetAccountIdContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(setAccountIdContract, selfType));
                    break;
                  case CreateSmartContract:
                    CreateSmartContract deployContract =
                        contractParameter.unpack(CreateSmartContract.class);
                    contractJson =
                        JSON.parseObject(JsonFormat.printToString(deployContract, selfType));
                    byte[] ownerAddress = deployContract.getOwnerAddress().toByteArray();
                    byte[] contractAddress = generateContractAddress(transaction, ownerAddress);
                    jsonTransaction.put("contract_address", ByteArray.toHexString(contractAddress));
                    break;
                  case TriggerSmartContract:
                    TriggerSmartContract triggerSmartContract =
                        contractParameter.unpack(TriggerSmartContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(triggerSmartContract, selfType));
                    break;
                  case UpdateSettingContract:
                    UpdateSettingContract updateSettingContract =
                        contractParameter.unpack(UpdateSettingContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(updateSettingContract, selfType));
                    break;
                  case ExchangeCreateContract:
                    ExchangeCreateContract exchangeCreateContract =
                        contractParameter.unpack(ExchangeCreateContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(exchangeCreateContract, selfType));
                    break;
                  case ExchangeInjectContract:
                    ExchangeInjectContract exchangeInjectContract =
                        contractParameter.unpack(ExchangeInjectContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(exchangeInjectContract, selfType));
                    break;
                  case ExchangeWithdrawContract:
                    ExchangeWithdrawContract exchangeWithdrawContract =
                        contractParameter.unpack(ExchangeWithdrawContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(exchangeWithdrawContract, selfType));
                    break;
                  case ExchangeTransactionContract:
                    ExchangeTransactionContract exchangeTransactionContract =
                        contractParameter.unpack(ExchangeTransactionContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(exchangeTransactionContract, selfType));
                    break;
                  case UpdateEnergyLimitContract:
                    UpdateEnergyLimitContract updateEnergyLimitContract =
                        contractParameter.unpack(UpdateEnergyLimitContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(updateEnergyLimitContract, selfType));
                    break;
                  case AccountPermissionUpdateContract:
                    AccountPermissionUpdateContract accountPermissionUpdateContract =
                        contractParameter.unpack(AccountPermissionUpdateContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(accountPermissionUpdateContract, selfType));
                    break;
                  case ClearABIContract:
                    ClearABIContract clearABIContract =
                        contractParameter.unpack(ClearABIContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(clearABIContract, selfType));
                    break;
                  case ShieldedTransferContract:
                    ShieldedTransferContract shieldedTransferContract =
                        contractParameter.unpack(ShieldedTransferContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(shieldedTransferContract, selfType));
                    break;
                  case UpdateBrokerageContract:
                    UpdateBrokerageContract updateBrokerageContract =
                        contract.getParameter().unpack(UpdateBrokerageContract.class);
                    contractJson =
                        JSON.parseObject(
                            JsonFormat.printToString(updateBrokerageContract, selfType));
                    break;
                  case MarketSellAssetContract:
                    MarketSellAssetContract marketSellAssetContract = contract.getParameter()
                        .unpack(MarketSellAssetContract.class);
                    contractJson = JSONObject
                        .parseObject(JsonFormat.printToString(marketSellAssetContract, selfType));
                    break;
                  case MarketCancelOrderContract:
                    MarketCancelOrderContract marketCancelOrderContract = contract.getParameter()
                        .unpack(MarketCancelOrderContract.class);
                    contractJson = JSONObject
                        .parseObject(JsonFormat.printToString(marketCancelOrderContract, selfType));
                    break;
                  // new freeze begin
                  case FreezeBalanceV2Contract:
                    BalanceContract.FreezeBalanceV2Contract freezeBalanceV2Contract =
                            contractParameter.unpack(BalanceContract.FreezeBalanceV2Contract.class);
                    contractJson =
                            JSON.parseObject(
                                    JsonFormat.printToString(freezeBalanceV2Contract, selfType));
                    break;
                  case UnfreezeBalanceV2Contract:
                    BalanceContract.UnfreezeBalanceV2Contract unfreezeBalanceV2Contract =
                            contractParameter.unpack(BalanceContract.UnfreezeBalanceV2Contract.class);
                    contractJson =
                            JSON.parseObject(
                                    JsonFormat.printToString(unfreezeBalanceV2Contract, selfType));
                    break;
                  case WithdrawExpireUnfreezeContract:
                    BalanceContract.WithdrawExpireUnfreezeContract withdrawExpireUnfreezeContract =
                            contractParameter.unpack(BalanceContract.WithdrawExpireUnfreezeContract.class);
                    contractJson =
                            JSON.parseObject(
                                    JsonFormat.printToString(withdrawExpireUnfreezeContract, selfType));
                    break;
                  case DelegateResourceContract:
                    BalanceContract.DelegateResourceContract delegateResourceContract =
                            contractParameter.unpack(BalanceContract.DelegateResourceContract.class);
                    contractJson =
                            JSON.parseObject(
                                    JsonFormat.printToString(delegateResourceContract, selfType));
                    break;
                  case UnDelegateResourceContract:
                    BalanceContract.UnDelegateResourceContract unDelegateResourceContract =
                            contractParameter.unpack(BalanceContract.UnDelegateResourceContract.class);
                    contractJson =
                            JSON.parseObject(
                                    JsonFormat.printToString(unDelegateResourceContract, selfType));
                    break;
                  case CancelAllUnfreezeV2Contract:
                    CancelAllUnfreezeV2Contract cancelAllUnfreezeV2Contract =
                        contractParameter.unpack(CancelAllUnfreezeV2Contract.class);
                    contractJson = JSON.parseObject(
                            JsonFormat.printToString(cancelAllUnfreezeV2Contract, selfType));
                    break;
                  // new freeze end
                  // todo add other contract
                  default:
                }
                JSONObject parameter = new JSONObject();
                parameter.put(VALUE, contractJson);
                parameter.put("type_url", contract.getParameterOrBuilder().getTypeUrl());
                JSONObject jsonContract = new JSONObject();
                jsonContract.put("parameter", parameter);
                jsonContract.put("type", contract.getType());
                if (contract.getPermissionId() > 0) {
                  jsonContract.put(PERMISSION_ID, contract.getPermissionId());
                }
                contracts.add(jsonContract);
              } catch (InvalidProtocolBufferException e) {
                e.printStackTrace();
                // System.out.println("InvalidProtocolBufferException: {}", e.getMessage());
              }
            });
    if (jsonTransaction.get("raw_data") == null) {
      return jsonTransaction;
    }
    JSONObject rawData = JSON.parseObject(jsonTransaction.get("raw_data").toString());
    rawData.put("contract", contracts);
    jsonTransaction.put("raw_data", rawData);
    String rawDataHex = ByteArray.toHexString(transaction.getRawData().toByteArray());
    jsonTransaction.put("raw_data_hex", rawDataHex);
    String txID = ByteArray.toHexString(Sha256Sm3Hash.hash(transaction.getRawData().toByteArray()));
    jsonTransaction.put("txID", txID);
    return jsonTransaction;
  }

  public static JSONObject printTransactionInfoToJSON(TransactionInfo transactioninfo) {
    return JSON.parseObject(JsonFormat.printToString(transactioninfo, true));
  }

  public static boolean confirmEncrption() {
    System.out.println(
        "Please confirm encryption module,if input " + greenBoldHighlight("y/Y") + " means default Eckey, other means SM2.");
    Scanner in = new Scanner(System.in);
    String input = in.nextLine().trim();
    String str = input.split("\\s+")[0];
    if ("y".equalsIgnoreCase(str)) {
      return true;
    }
    return false;
  }
  public static boolean isNumericString(String str) {
    for (int i = str.length(); --i >= 0; ) {
      if (!Character.isDigit(str.charAt(i))) {
        return false;
      }
    }
    return true;
  }
  public static boolean isHexString(String str) {
    boolean bRet = false;
    try {
      ByteArray.fromHexString(str);
      bRet = true;
    } catch (Exception e) {
    }
    return bRet;
  }

  public static String yellowBoldHighlight(String str) {
    return ANSI_BOLD + ANSI_YELLOW + str + ANSI_RESET;
  }

  public static String greenHighlight(String str) {
    return ANSI_GREEN + str + ANSI_RESET;
  }

  public static String greenBoldHighlight(String str) {
    return ANSI_BOLD + ANSI_GREEN + str + ANSI_RESET;
  }

  public static String greenBoldHighlight(int i) {
    return ANSI_BOLD + ANSI_GREEN + i + ANSI_RESET;
  }

  public static String greenBoldHighlight(long i) {
    return ANSI_BOLD + ANSI_GREEN + i + ANSI_RESET;
  }

  public static String blueBoldHighlight(String str) {
    return ANSI_BOLD + ANSI_BLUE + str + ANSI_RESET;
  }

  public static String redBoldHighlight(String str) {
    return ANSI_BOLD + ANSI_RED + str + ANSI_RESET;
  }

  public static String successfulHighlight() {
    return ANSI_BOLD + ANSI_GREEN + " successful" + ANSI_RESET;
  }

  public static String failedHighlight() {
    return ANSI_BOLD + ANSI_RED + " failed" + ANSI_RESET;
  }

  public static long getLong(String str) {
    if (isEmpty(str)) {
      return 300;
    }
    try {
      return Long.parseLong(str);
    } catch (NumberFormatException e) {
      throw new IllegalArgumentException("The parameter is invalid. Please enter an integer.");
    }
  }

  public static void printBanner() {
    try (InputStream inputStream = Client.class.getResourceAsStream("/banner.txt")) {
      if (inputStream != null) {
        String banner = new String(readAllBytes(inputStream), StandardCharsets.UTF_8);
        System.out.println(blueBoldHighlight(banner) + blueBoldHighlight(VERSION));
      } else {
        System.out.println("No banner.txt found!");
      }
    } catch (IOException e) {
      System.err.println("Failed to load banner: " + e.getMessage());
    }
  }

  public static void printHelp() {
    try (InputStream inputStream = Client.class.getResourceAsStream("/help_summary.txt")) {
      if (inputStream != null) {
        String banner = new String(readAllBytes(inputStream), StandardCharsets.UTF_8);
        System.out.println(blueBoldHighlight(banner));
      } else {
        System.out.println("No help_summary.txt found!");
      }
    } catch (IOException e) {
      System.err.println("Failed to load help summary: " + e.getMessage());
    }
  }

  private static byte[] readAllBytes(InputStream inputStream) throws IOException {
    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    byte[] data = new byte[4096];
    int bytesRead;
    while ((bytesRead = inputStream.read(data, 0, data.length)) != -1) {
      buffer.write(data, 0, bytesRead);
    }
    return buffer.toByteArray();
  }

  public static boolean isValid(String address1, String address2) {
    if ((address1 == null || address1.trim().isEmpty()) &&
        (address2 == null || address2.trim().isEmpty())) {
      System.out.println("Both addresses cannot be empty!");
      return false;
    }

    Pattern pattern = Pattern.compile(HOST_REGEX);

    Result result1 = getResult(address1, pattern);
    if (result1 == null) {
      return false;
    }

    Result result2 = getResult(address2, pattern);
    if (result2 == null) {
      return false;
    }

    if (result1.host != null && result2.host != null &&
        result1.host.equalsIgnoreCase(result2.host) && result1.port == result2.port) {
      System.out.println("The same host cannot use the same port: " + address1 + " & " + address2);
      return false;
    }

    return true;
  }

  @Nullable
  private static Result getResult(String address, Pattern pattern) {
    String host = null;
    int port = -1;
    if (address != null && !address.trim().isEmpty()) {
      Matcher matcher = pattern.matcher(address.trim());
      if (!matcher.matches()) {
        System.out.println("host:port format is invalid: " + address);
        return null;
      }
      host = matcher.group(1);
      if (!isDomainOrIP(host)) {
        System.out.println("The domain name or IP format is invalid.");
        return null;
      }
      port = Integer.parseInt(matcher.group(2));
      if (port < 1 || port > 65535) {
        System.out.println("The port number is invalid: " + port + " in " + address);
        return null;
      }
    }
    return new Result(host, port);
  }

  private static class Result {
    public final String host;
    public final int port;

    public Result(String host, int port) {
      this.host = host;
      this.port = port;
    }
  }

  public static boolean isValid(String address) {
    Pattern pattern = Pattern.compile(HOST_REGEX);

    Matcher matcher = pattern.matcher(address);

    if (!matcher.matches()) {
      return false;
    }

    int port = Integer.parseInt(matcher.group(2));
    return port >= 1 && port <= 65535;
  }

  public static void printStackTrace(Exception e) {
    if (DebugConfig.isDebugEnabled()) {
      e.printStackTrace();
    }
  }

  public static String getNode(Config config, String path) {
    if (config.hasPath(path)) {
      List<String> nodeList = config.getStringList(path);
      if (!nodeList.isEmpty()) {
        return nodeList.get(0);
      }
    }
    return EMPTY;
  }

  public static void printWalletInfo(List<WalletFile> walletFileList, int index) {
    WalletFile wf = walletFileList.get(index);
    String walletName = org.apache.commons.lang3.StringUtils.isEmpty(wf.getName())
        ? wf.getSourceFile().getName() : wf.getName();

    System.out.println(formatLine(
        String.valueOf(index + 1),
        wf.getAddress(),
        walletName,
        4, 42, 76));
  }

  public static void searchWallets(List<WalletFile> walletFileList, String searchTerm) {
    String headerFormat = "%-4s %-42s %-76s";
    boolean found = false;

    System.out.println(greenBoldHighlight(String.format(headerFormat, "No.", "Address", "Name")));

    for (int i = 0; i < walletFileList.size(); i++) {
      WalletFile wf = walletFileList.get(i);

      if (wf.getName().toLowerCase().contains(searchTerm.toLowerCase()) ||
          wf.getAddress().toLowerCase().contains(searchTerm.toLowerCase())) {

        printWalletInfo(walletFileList, i);
        found = true;
      }
    }

    if (!found) {
      System.out.println("No wallets found matching: " + searchTerm);
    }
  }

  public static void listWallets(List<WalletFile> walletFileList) {
    System.out.println("\n" + greenBoldHighlight(formatLine("No.", "Address", "Name", 4, 42, 76)));

    IntStream.range(0, walletFileList.size())
        .mapToObj(i -> {
          WalletFile wf = walletFileList.get(i);
          return formatLine(
              String.valueOf(i + 1),
              wf.getAddress(),
              wf.getName(),
              4, 42, 76);
        })
        .forEach(System.out::println);
  }

  public static String formatLine(String no, String address, String name,
                                  int noWidth, int addrWidth, int nameWidth) {
    String displayName = truncateToWidth(name, nameWidth);

    if (containsChinese(displayName)) {
      displayName += " ";
    }

    return padRight(no, noWidth) + " "
        + padRight(address, addrWidth) + " "
        + padRight(displayName, nameWidth);
  }

  public static int getDisplayWidth(String str) {
    if (str == null) return 0;
    return str.codePoints()
        .map(c -> isWideChar(c) ? 2 : 1)
        .sum();
  }

  private static boolean isWideChar(int codePoint) {
    // CJK Unified Ideographs
    return (codePoint >= 0x1100 && (
        codePoint <= 0x115F || // Hangul Jamo
            codePoint == 0x2329 || codePoint == 0x232A ||
            (codePoint >= 0x2E80 && codePoint <= 0xA4CF && codePoint != 0x303F) ||
            (codePoint >= 0xAC00 && codePoint <= 0xD7A3) || // Hangul Syllables
            (codePoint >= 0xF900 && codePoint <= 0xFAFF) || // CJK Compatibility Ideographs
            (codePoint >= 0xFE10 && codePoint <= 0xFE19) ||
            (codePoint >= 0xFE30 && codePoint <= 0xFE6F) ||
            (codePoint >= 0xFF00 && codePoint <= 0xFF60) || // Full-width ASCII variants
            (codePoint >= 0xFFE0 && codePoint <= 0xFFE6)
    ));
  }

  private static String truncateToWidth(String str, int maxWidth) {
    if (str == null) return "";

    int ellipsisWidth = getDisplayWidth("...");
    if (getDisplayWidth(str) <= maxWidth) {
      return str;
    }

    StringBuilder sb = new StringBuilder();
    int width = 0;
    for (int i = 0; i < str.length(); ) {
      int codePoint = str.codePointAt(i);
      int charWidth = isWideChar(codePoint) ? 2 : 1;

      if (width + charWidth + ellipsisWidth > maxWidth) {
        break;
      }

      sb.appendCodePoint(codePoint);
      width += charWidth;
      i += Character.charCount(codePoint);
    }

    return sb + "...";
  }

  private static String padRight(String str, int targetWidth) {
    int currentWidth = getDisplayWidth(str);

    if (containsChinese(str)) {
      currentWidth--;
    }
    if (containsChinese(str) && str.contains("...") ) {
      currentWidth--;
    }
    if (currentWidth >= targetWidth) {
      return str;
    }
    return str + spaces(targetWidth - currentWidth);
  }

  private static String spaces(int count) {
    return IntStream.range(0, count)
        .mapToObj(i -> " ")
        .collect(Collectors.joining());
  }

  public static void nameWallet(WalletFile walletFile, boolean isLedger) {
    Scanner scanner = new Scanner(System.in);
    System.out.print("Please name your wallet: ");
    String walletName = scanner.nextLine().trim();

    while(!isValidWalletName(walletName)) {
      System.out.print("The wallet name cannot be empty and "
          + String.format("must be between %d and %d characters", MIN_LENGTH, MAX_LENGTH)
          + " Please re-enter: ");
      walletName = scanner.nextLine().trim();
    }
    if (isLedger) {
      walletName = "Ledger-" + walletName;
    }
    walletFile.setName(walletName);
  }

  public static boolean isValidWalletName(String name) {
    if (org.apache.commons.lang3.StringUtils.isEmpty(name)) {
      return false;
    }
    return name.length() >= MIN_LENGTH && name.length() <= MAX_LENGTH;
  }

  private static boolean containsChinese(String str) {
    if (str == null) return false;
    return str.codePoints().anyMatch(
        c -> (c >= 0x4E00 && c <= 0x9FFF)
    );
  }

  public static String intToBooleanString(int value) {
    return value == 1 ? "true" : "false";
  }

  public static boolean allNotBlank(Triple<String, String, String> triple) {
    return triple != null
        && isNoneBlank(
        triple.getLeft(),
        triple.getMiddle(),
        triple.getRight()
    );
  }

}
