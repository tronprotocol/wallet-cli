package org.tron.explorer.domain;

public class TransferAsset {
  private String assetName;
  private String Address;
  private String toAddress;
  private String Amount;

  public TransferAsset() {

  }

  public TransferAsset(String address, String toAddress, String assetName, String amount) {
    Address = address;
    this.toAddress = toAddress;
    this.assetName = assetName;
    Amount = amount;
  }

  public String getAddress() {
    return Address;
  }

  public void setAddress(String address) {
    Address = address;
  }

  public String getToAddress() {
    return toAddress;
  }

  public void setToAddress(String toAddress) {
    this.toAddress = toAddress;
  }

  public String getAssetName() {
    return assetName;
  }

  public void setAssetName(String assetName) {
    this.assetName = assetName;
  }

  public String getAmount() {
    return Amount;
  }

  public void setAmount(String amount) {
    Amount = amount;
  }

  @Override
  public String toString() {
    return "TransferAsset{" +
        "Address='" + Address + '\'' +
        ", toAddress='" + toAddress + '\'' +
        ", assetName='" + assetName + '\'' +
        ", Amount='" + Amount + '\'' +
        '}';
  }
}
