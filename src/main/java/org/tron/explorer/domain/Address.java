package org.tron.explorer.domain;

public class Address {

  private String tobyte;
  private String Address;
  private String PubKey;
  private String toAddress;
  private String Amount;

  public String getAmount() {
    return Amount;
  }

  public void setToAddress(String toAddress) {
    this.toAddress = toAddress;
  }

  public void setAmount(String amount) {
    Amount = amount;
  }

  public String getToAddress() {
    return toAddress;
  }

  public Address() {
  }

  public void setTobyte(String tobyte) {
    this.tobyte = tobyte;
  }

  public void setAddress(String address) {
    Address = address;
  }

  public void setPubKey(String pubKey) {
    PubKey = pubKey;
  }

  public String getTobyte() {
    return tobyte;
  }

  public String getAddress() {
    return Address;
  }

  public String getPubKey() {
    return PubKey;
  }

  @Override
  public String toString() {
    return "Address{" +
        "tobyte='" + tobyte + '\'' +
        ", Address='" + Address + '\'' +
        ", PubKey='" + PubKey + '\'' +
        '}';
  }
}
