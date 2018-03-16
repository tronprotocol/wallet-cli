package org.tron.explorer.domain;

public class Transfer {

  private String password;
  private String toAddress;
  private String coin;

  public Transfer(String password, String toAddress, String coin) {
    this.password = password;
    this.toAddress = toAddress;
    this.coin = coin;
  }

  public Transfer() {
  }

  @Override
  public String toString() {
    return "Transfer{" +
        "password='" + password + '\'' +
        ", toAddress='" + toAddress + '\'' +
        ", coin='" + coin + '\'' +
        '}';
  }

  public String getPassword() {
    return password;
  }

  public String getToAddress() {
    return toAddress;
  }

  public String getCoin() {
    return coin;
  }

  public void setPassword(String password) {
    this.password = password;
  }

  public void setToAddress(String toAddress) {
    this.toAddress = toAddress;
  }

  public void setCoin(String coin) {
    this.coin = coin;
  }
}
