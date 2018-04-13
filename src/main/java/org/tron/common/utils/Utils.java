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

import java.security.SecureRandom;
import java.nio.*;
import java.nio.charset.Charset;
import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.Date;
import org.tron.api.GrpcAPI.AccountList;
import org.tron.api.GrpcAPI.AssetIssueList;
import org.tron.api.GrpcAPI.WitnessList;
import org.tron.protos.Contract.AssetIssueContract;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.Account.Vote;
import org.tron.protos.Protocol.Witness;
import org.tron.walletserver.WalletClient;

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
    SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd");
    ParsePosition pos = new ParsePosition(0);
    Date strtodate = formatter.parse(strDate, pos);
    return strtodate;
  }

  public static String printAccount(Account account) {
    String result = "";
    result += "address: ";
    result += WalletClient.encode58Check(account.getAddress().toByteArray());
    result += "\n";
    if (account.getAccountName() != null && account.getAccountName().size() != 0) {
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
    if (account.getVotesCount() > 0) {
      for (Vote vote : account.getVotesList()) {
        result += "votes";
        result += "\n";
        result += "{";
        result += "\n";
        result += "  vote_address: ";
        result += WalletClient.encode58Check(vote.getVoteAddress().toByteArray());
        result += "\n";
        result += "  vote_count: ";
        result += vote.getVoteCount();
        result += "\n";
        result += "}";
        result += "\n";
      }
    }
    if (account.getAssetCount() > 0) {
      for(String name: account.getAssetMap().keySet()){
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
        result += "}";
        result += "\n";
      }
    }
    result += "latest_opration_time: ";
    result += account.getLatestOprationTime();
    result += "\n";

    return result;
  }

  public static String printAccountList(AccountList accountList){
    String result = "\n";
    int i = 0;
    for ( Account account: accountList.getAccountsList()){
      result += "account " + i + " :::";
      result += "\n";
      result += "[";
      result += "\n";
      result += printAccount(account);
      result += "]";
      result += "\n";
      result += "\n";
      i++;
    }
    return result;
  }

  public static String printWitness(Witness witness) {
    String result = "";
    result += "address: ";
    result += WalletClient.encode58Check(witness.getAddress().toByteArray());
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

  public static String printWitnessList(WitnessList witnessList){
    String result = "\n";
    int i = 0;
    for ( Witness witness: witnessList.getWitnessesList()){
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
    result += "owner_address: ";
    result += WalletClient.encode58Check(assetIssue.getOwnerAddress().toByteArray());
    result += "\n";
    result += "name: ";
    result += new String(assetIssue.getName().toByteArray(), Charset.forName("UTF-8"));
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
    result += "start_time: ";
    result += new Date(assetIssue.getStartTime());
    result += "\n";
    result += "end_time: ";
    result += new Date(assetIssue.getEndTime());
    result += "\n";
    result += "decay_ratio: ";
    result += assetIssue.getDecayRatio();
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
    return result;
  }

  public static String printAssetIssueList(AssetIssueList assetIssueList){
    String result = "\n";
    int i = 0;
    for ( AssetIssueContract assetIssue: assetIssueList.getAssetIssueList()){
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
}
