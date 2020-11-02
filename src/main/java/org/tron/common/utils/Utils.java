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

import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.google.protobuf.Any;
import com.google.protobuf.InvalidProtocolBufferException;
import com.google.protobuf.Message;

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
import java.util.Scanner;

import org.tron.api.GrpcAPI.*;
import org.tron.common.crypto.Hash;
import org.tron.common.crypto.Sha256Sm3Hash;
import org.tron.keystore.StringUtils;
import org.tron.walletserver.WalletApi;
import org.tron.protos.Protocol.Block;
import org.tron.protos.Protocol.Transaction;
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
import org.tron.protos.contract.BalanceContract.FreezeBalanceContract;
import org.tron.protos.contract.BalanceContract.TransferContract;
import org.tron.protos.contract.BalanceContract.UnfreezeBalanceContract;
import org.tron.protos.contract.BalanceContract.WithdrawBalanceContract;
import org.tron.protos.contract.ExchangeContract.ExchangeCreateContract;
import org.tron.protos.contract.ExchangeContract.ExchangeInjectContract;
import org.tron.protos.contract.ExchangeContract.ExchangeTransactionContract;
import org.tron.protos.contract.ExchangeContract.ExchangeWithdrawContract;
import org.tron.protos.contract.ProposalContract.ProposalApproveContract;
import org.tron.protos.contract.ProposalContract.ProposalCreateContract;
import org.tron.protos.contract.ProposalContract.ProposalDeleteContract;
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
import org.tron.protos.contract.ShieldContract.ShieldedTransferContract;
import org.tron.protos.contract.MarketContract.MarketCancelOrderContract;
import org.tron.protos.contract.MarketContract.MarketSellAssetContract;

public class Utils {
  public static final String PERMISSION_ID = "Permission_id";
  public static final String VISIBLE = "visible";
  public static final String TRANSACTION = "transaction";
  public static final String VALUE = "value";

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

  public static String printTransactionExceptId(Transaction transaction) {
    JSONObject jsonObject = printTransactionToJSON(transaction, true);
    jsonObject.remove("txID");
    return JsonFormatUtil.formatJson(jsonObject.toJSONString());
  }

  public static String printTransaction(Transaction transaction) {
    String result = printTransactionToJSON(transaction, true).toJSONString();
    return JsonFormatUtil.formatJson(result);
  }

  public static String printTransaction(TransactionExtention transactionExtention) {
    JSONObject jsonObject = printTransactionExtentionToJSON(transactionExtention);
    return JsonFormatUtil.formatJson(jsonObject.toJSONString());
  }

  public static String printTransactionList(TransactionList transactionList) {
    JSONArray jsonArray = new JSONArray();
    List<Transaction> transactions = transactionList.getTransactionList();
    transactions.stream()
        .forEach(
            transaction -> {
              jsonArray.add(printTransactionToJSON(transaction, true));
            });
    return JsonFormatUtil.formatJson(jsonArray.toJSONString());
  }

  public static String printTransactionInfoList(TransactionInfoList transactionInfoList) {
    JSONArray jsonArray = new JSONArray();
    List<TransactionInfo> infoList = transactionInfoList.getTransactionInfoList();
    infoList.stream()
        .forEach(
            transactionInfo -> jsonArray.add(formatMessageString(transactionInfo))
        );
    return JsonFormatUtil.formatJson(jsonArray.toJSONString());
  }

  public static String printTransactionList(TransactionListExtention transactionList) {
    JSONArray jsonArray = new JSONArray();
    List<TransactionExtention> transactions = transactionList.getTransactionList();
    transactions.stream()
        .forEach(
            transaction -> {
              jsonArray.add(printTransactionExtentionToJSON(transaction));
            });
    return JsonFormatUtil.formatJson(jsonArray.toJSONString());
  }

  public static String printBlock(Block block) {
    JSONObject jsonObject = printBlockToJSON(block);
    return JsonFormatUtil.formatJson(jsonObject.toJSONString());
  }

  public static String printBlockExtention(BlockExtention blockExtention) {
    JSONObject jsonObject = printBlockExtentionToJSON(blockExtention);
    return JsonFormatUtil.formatJson(jsonObject.toJSONString());
  }

  public static String printBlockList(BlockList blockList) {
    JSONArray jsonArray = new JSONArray();
    List<Block> blocks = blockList.getBlockList();
    blocks.stream()
        .forEach(
            block -> {
              jsonArray.add(printBlockToJSON(block));
            });
    return JsonFormatUtil.formatJson(jsonArray.toJSONString());
  }

  public static String printBlockList(BlockListExtention blockList) {
    JSONArray jsonArray = new JSONArray();
    List<BlockExtention> blocks = blockList.getBlockList();
    blocks.stream()
        .forEach(
            block -> {
              jsonArray.add(printBlockExtentionToJSON(block));
            });
    return JsonFormatUtil.formatJson(jsonArray.toJSONString());
  }

  public static String printTransactionSignWeight(TransactionSignWeight transactionSignWeight) {
    String string = JsonFormat.printToString(transactionSignWeight, true);
    JSONObject jsonObject = JSONObject.parseObject(string);
    JSONObject jsonObjectExt = jsonObject.getJSONObject(TRANSACTION);
    jsonObjectExt.put(
        TRANSACTION,
        printTransactionToJSON(transactionSignWeight.getTransaction().getTransaction(), true));
    jsonObject.put(TRANSACTION, jsonObjectExt);
    return JsonFormatUtil.formatJson(jsonObject.toJSONString());
  }

  public static String printTransactionApprovedList(
      TransactionApprovedList transactionApprovedList) {
    String string = JsonFormat.printToString(transactionApprovedList, true);
    JSONObject jsonObject = JSONObject.parseObject(string);
    JSONObject jsonObjectExt = jsonObject.getJSONObject(TRANSACTION);
    jsonObjectExt.put(
        TRANSACTION,
        printTransactionToJSON(transactionApprovedList.getTransaction().getTransaction(), true));
    jsonObject.put(TRANSACTION, jsonObjectExt);
    return JsonFormatUtil.formatJson(jsonObject.toJSONString());
  }

  public static char[] inputPassword2Twice() throws IOException {
    char[] password0;
    while (true) {
      System.out.println("Please input password.");
      password0 = Utils.inputPassword(true);
      System.out.println("Please input password again.");
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

  public static byte[] generateContractAddress(Transaction trx, byte[] ownerAddress) {
    // get tx hash
    byte[] txRawDataHash = Sha256Sm3Hash.of(trx.getRawData().toByteArray()).getBytes();

    // combine
    byte[] combined = new byte[txRawDataHash.length + ownerAddress.length];
    System.arraycopy(txRawDataHash, 0, combined, 0, txRawDataHash.length);
    System.arraycopy(ownerAddress, 0, combined, txRawDataHash.length, ownerAddress.length);

    return Hash.sha3omit12(combined);
  }

  public static JSONObject printBlockExtentionToJSON(BlockExtention blockExtention) {
    JSONObject jsonObject = JSONObject.parseObject(JsonFormat.printToString(blockExtention, true));
    if (blockExtention.getTransactionsCount() > 0) {
      JSONArray jsonArray = new JSONArray();
      List<TransactionExtention> transactions = blockExtention.getTransactionsList();
      transactions.stream()
          .forEach(
              transaction -> {
                jsonArray.add(printTransactionExtentionToJSON(transaction));
              });
      jsonObject.put(TRANSACTION, jsonArray);
    }
    return jsonObject;
  }

  public static JSONObject printBlockToJSON(Block block) {
    JSONObject jsonObject = JSONObject.parseObject(JsonFormat.printToString(block, true));
    if (block.getTransactionsCount() > 0) {
      JSONArray jsonArray = new JSONArray();
      List<Transaction> transactions = block.getTransactionsList();
      transactions.stream()
          .forEach(
              transaction -> {
                jsonArray.add(printTransactionToJSON(transaction, true));
              });
      jsonObject.put(TRANSACTION, jsonArray);
    }
    return jsonObject;
  }

  public static JSONObject printTransactionExtentionToJSON(
      TransactionExtention transactionExtention) {
    JSONObject jsonObject =
        JSONObject.parseObject(JsonFormat.printToString(transactionExtention, true));
    if (transactionExtention.getResult().getResult()) {
      JSONObject transactionOjbect =
          printTransactionToJSON(transactionExtention.getTransaction(), true);
      jsonObject.put(TRANSACTION, transactionOjbect);
    }
    return jsonObject;
  }

  public static JSONObject printTransactionToJSON(Transaction transaction, boolean selfType) {
    JSONObject jsonTransaction =
        JSONObject.parseObject(JsonFormat.printToString(transaction, selfType));
    JSONArray contracts = new JSONArray();
    transaction.getRawData().getContractList().stream()
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
                        JSONObject.parseObject(
                            JsonFormat.printToString(accountCreateContract, selfType));
                    break;
                  case TransferContract:
                    TransferContract transferContract =
                        contractParameter.unpack(TransferContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(transferContract, selfType));
                    break;
                  case TransferAssetContract:
                    TransferAssetContract transferAssetContract =
                        contractParameter.unpack(TransferAssetContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(transferAssetContract, selfType));
                    break;
                  case VoteAssetContract:
                    VoteAssetContract voteAssetContract =
                        contractParameter.unpack(VoteAssetContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(voteAssetContract, selfType));
                    break;
                  case VoteWitnessContract:
                    VoteWitnessContract voteWitnessContract =
                        contractParameter.unpack(VoteWitnessContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(voteWitnessContract, selfType));
                    break;
                  case WitnessCreateContract:
                    WitnessCreateContract witnessCreateContract =
                        contractParameter.unpack(WitnessCreateContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(witnessCreateContract, selfType));
                    break;
                  case AssetIssueContract:
                    AssetIssueContract assetIssueContract =
                        contractParameter.unpack(AssetIssueContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(assetIssueContract, selfType));
                    break;
                  case WitnessUpdateContract:
                    WitnessUpdateContract witnessUpdateContract =
                        contractParameter.unpack(WitnessUpdateContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(witnessUpdateContract, selfType));
                    break;
                  case ParticipateAssetIssueContract:
                    ParticipateAssetIssueContract participateAssetIssueContract =
                        contractParameter.unpack(ParticipateAssetIssueContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(participateAssetIssueContract, selfType));
                    break;
                  case AccountUpdateContract:
                    AccountUpdateContract accountUpdateContract =
                        contractParameter.unpack(AccountUpdateContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(accountUpdateContract, selfType));
                    break;
                  case FreezeBalanceContract:
                    FreezeBalanceContract freezeBalanceContract =
                        contractParameter.unpack(FreezeBalanceContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(freezeBalanceContract, selfType));
                    break;
                  case UnfreezeBalanceContract:
                    UnfreezeBalanceContract unfreezeBalanceContract =
                        contractParameter.unpack(UnfreezeBalanceContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(unfreezeBalanceContract, selfType));
                    break;
                  case WithdrawBalanceContract:
                    WithdrawBalanceContract withdrawBalanceContract =
                        contractParameter.unpack(WithdrawBalanceContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(withdrawBalanceContract, selfType));
                    break;
                  case UnfreezeAssetContract:
                    UnfreezeAssetContract unfreezeAssetContract =
                        contractParameter.unpack(UnfreezeAssetContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(unfreezeAssetContract, selfType));
                    break;
                  case UpdateAssetContract:
                    UpdateAssetContract updateAssetContract =
                        contractParameter.unpack(UpdateAssetContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(updateAssetContract, selfType));
                    break;
                  case ProposalCreateContract:
                    ProposalCreateContract proposalCreateContract =
                        contractParameter.unpack(ProposalCreateContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(proposalCreateContract, selfType));
                    break;
                  case ProposalApproveContract:
                    ProposalApproveContract proposalApproveContract =
                        contractParameter.unpack(ProposalApproveContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(proposalApproveContract, selfType));
                    break;
                  case ProposalDeleteContract:
                    ProposalDeleteContract proposalDeleteContract =
                        contractParameter.unpack(ProposalDeleteContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(proposalDeleteContract, selfType));
                    break;
                  case SetAccountIdContract:
                    SetAccountIdContract setAccountIdContract =
                        contractParameter.unpack(
                            SetAccountIdContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(setAccountIdContract, selfType));
                    break;
                  case CreateSmartContract:
                    CreateSmartContract deployContract =
                        contractParameter.unpack(CreateSmartContract.class);
                    contractJson =
                        JSONObject.parseObject(JsonFormat.printToString(deployContract, selfType));
                    byte[] ownerAddress = deployContract.getOwnerAddress().toByteArray();
                    byte[] contractAddress = generateContractAddress(transaction, ownerAddress);
                    jsonTransaction.put("contract_address", ByteArray.toHexString(contractAddress));
                    break;
                  case TriggerSmartContract:
                    TriggerSmartContract triggerSmartContract =
                        contractParameter.unpack(TriggerSmartContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(triggerSmartContract, selfType));
                    break;
                  case UpdateSettingContract:
                    UpdateSettingContract updateSettingContract =
                        contractParameter.unpack(UpdateSettingContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(updateSettingContract, selfType));
                    break;
                  case ExchangeCreateContract:
                    ExchangeCreateContract exchangeCreateContract =
                        contractParameter.unpack(ExchangeCreateContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(exchangeCreateContract, selfType));
                    break;
                  case ExchangeInjectContract:
                    ExchangeInjectContract exchangeInjectContract =
                        contractParameter.unpack(ExchangeInjectContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(exchangeInjectContract, selfType));
                    break;
                  case ExchangeWithdrawContract:
                    ExchangeWithdrawContract exchangeWithdrawContract =
                        contractParameter.unpack(ExchangeWithdrawContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(exchangeWithdrawContract, selfType));
                    break;
                  case ExchangeTransactionContract:
                    ExchangeTransactionContract exchangeTransactionContract =
                        contractParameter.unpack(ExchangeTransactionContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(exchangeTransactionContract, selfType));
                    break;
                  case UpdateEnergyLimitContract:
                    UpdateEnergyLimitContract updateEnergyLimitContract =
                        contractParameter.unpack(UpdateEnergyLimitContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(updateEnergyLimitContract, selfType));
                    break;
                  case AccountPermissionUpdateContract:
                    AccountPermissionUpdateContract accountPermissionUpdateContract =
                        contractParameter.unpack(AccountPermissionUpdateContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(accountPermissionUpdateContract, selfType));
                    break;
                  case ClearABIContract:
                    ClearABIContract clearABIContract =
                        contractParameter.unpack(ClearABIContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(clearABIContract, selfType));
                    break;
                  case ShieldedTransferContract:
                    ShieldedTransferContract shieldedTransferContract =
                        contractParameter.unpack(ShieldedTransferContract.class);
                    contractJson =
                        JSONObject.parseObject(
                            JsonFormat.printToString(shieldedTransferContract, selfType));
                    break;
                  case UpdateBrokerageContract:
                    UpdateBrokerageContract updateBrokerageContract =
                        contract.getParameter().unpack(UpdateBrokerageContract.class);
                    contractJson =
                        JSONObject.parseObject(
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

    JSONObject rawData = JSONObject.parseObject(jsonTransaction.get("raw_data").toString());
    rawData.put("contract", contracts);
    jsonTransaction.put("raw_data", rawData);
    String rawDataHex = ByteArray.toHexString(transaction.getRawData().toByteArray());
    jsonTransaction.put("raw_data_hex", rawDataHex);
    String txID = ByteArray.toHexString(Sha256Sm3Hash.hash(transaction.getRawData().toByteArray()));
    jsonTransaction.put("txID", txID);
    return jsonTransaction;
  }

  public static boolean confirmEncrption() {
    System.out.println(
        "Please confirm encryption module,if input y or Y means default Eckey, other means SM2.");
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
}
