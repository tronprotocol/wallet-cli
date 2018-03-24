package org.tron.explorer.domain;

public class Witness {

  private String address;
  private String amount;

  public Witness(String address, String amount){
    this.address = address;
    this.amount = amount;
  }

  public Witness() {
  }

  public String getAddress() {
    return address;
  }

  public void setAddress(String address) {
    this.address = address;
  }

  public String getAmount() {
    return amount;
  }

  public void setAmount(String amount) {
    this.amount = amount;
  }
}
