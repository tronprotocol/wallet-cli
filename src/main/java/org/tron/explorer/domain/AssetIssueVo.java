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

package org.tron.explorer.domain;


import java.util.HashMap;

public class AssetIssueVo {


  private String ownerAddress;
  private String name;
  private long totalSupply;
  private int trxNum;
  private int num;
  private long startTime;
  private long endTime;
  private int voteScore;
  private String description;
  private String url;
  private HashMap<String,String> frozenSupply;

  public AssetIssueVo(String ownerAddress, String name, long totalSupply, int trxNum,
      int num, long startTime, long endTime, int voteScore,
      String description, String url, HashMap<String,String> frozenSupply) {
    this.ownerAddress = ownerAddress;
    this.name = name;
    this.totalSupply = totalSupply;
    this.trxNum = trxNum;
    this.num = num;
    this.startTime = startTime;
    this.endTime = endTime;
    this.voteScore = voteScore;
    this.description = description;
    this.url = url;
    this.frozenSupply = frozenSupply;
  }

  public AssetIssueVo() {
  }

  public String getOwnerAddress() {
    return ownerAddress;
  }

  public void setOwnerAddress(String ownerAddress) {
    this.ownerAddress = ownerAddress;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public long getTotalSupply() {
    return totalSupply;
  }

  public void setTotalSupply(long totalSupply) {
    this.totalSupply = totalSupply;
  }

  public int getTrxNum() {
    return trxNum;
  }

  public void setTrxNum(int trxNum) {
    this.trxNum = trxNum;
  }

  public int getNum() {
    return num;
  }

  public void setNum(int num) {
    this.num = num;
  }

  public long getStartTime() {
    return startTime;
  }

  public void setStartTime(long startTime) {
    this.startTime = startTime;
  }

  public long getEndTime() {
    return endTime;
  }

  public void setEndTime(long endTime) {
    this.endTime = endTime;
  }

  public int getVoteScore() {
    return voteScore;
  }

  public void setVoteScore(int voteScore) {
    this.voteScore = voteScore;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public String getUrl() {
    return url;
  }

  public void setUrl(String url) {
    this.url = url;
  }

  public HashMap<String, String> getFrozenSupply() {
    return frozenSupply;
  }

  public void setFrozenSupply(HashMap<String,String> frozenSupply) {
    this.frozenSupply = frozenSupply;
  }

  @Override
  public String toString() {
    return "AssetIssueVo{" +
        "ownerAddress=" + ownerAddress +
        ", name=" + name +
        ", totalSupply=" + totalSupply +
        ", trxNum=" + trxNum +
        ", num=" + num +
        ", startTime=" + startTime +
        ", endTime=" + endTime +
        ", voteScore=" + voteScore +
        ", description=" + description +
        ", url=" + url +
        ", frozenSupply=" + frozenSupply.toString() +
        '}';
  }
}
