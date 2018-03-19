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


public class AccountVo {

  private String name;
  private String address;
  private long balance;
  private int accountType;
  public AccountVo(String address, long balance) {
    this.address = address;
    this.balance = balance;
  }

  public AccountVo(String name, String address, long balance) {
    this.name = name;
    this.address = address;
    this.balance = balance;
  }

  public AccountVo(String name, String address, long balance, int accountType) {
    this.name = name;
    this.address = address;
    this.balance = balance;
    this.accountType = accountType;
  }

  public AccountVo() {
  }


  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getAddress() {
    return address;
  }

  public void setAddress(String address) {
    this.address = address;
  }

  public long getBalance() {
    return balance;
  }

  public void setBalance(long balance) {
    this.balance = balance;
  }

  public int getAccountType() {
    return accountType;
  }

  public void setAccountType(int accountType) {
    this.accountType = accountType;
  }

  @Override
  public String toString() {
    return "AccountVo{"
        + "name='" + name + '\''
        + ", address='" + address + '\''
        + ", balance='" + balance + '\''
        + ", accountType=" + accountType
        + '}';
  }
}
