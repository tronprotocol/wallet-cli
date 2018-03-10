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


public class Account {
 public String address;
 public String balance;

  public Account(String address, String balance) {
    this.address = address;
    this.balance = balance;
  }

  public Account() {
  }

  public String getAddress() {
    return address;
  }

  public void setAddress(String address) {
    this.address = address;
  }

  public String getBalance() {
    return balance;
  }

  public void setBalance(String balance) {
    this.balance = balance;
  }

  @Override
  public String toString() {
    return "Account{" +
        "address='" + address + '\'' +
        ", balance='" + balance + '\'' +
        '}';
  }
}
