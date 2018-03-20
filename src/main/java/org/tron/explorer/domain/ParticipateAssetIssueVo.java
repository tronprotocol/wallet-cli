package org.tron.explorer.domain;

public class ParticipateAssetIssueVo {

    private String ownerAddress;
    private String getToAddress;
    private String name;
    private long Amount;

    public String getOwnerAddress() {
        return ownerAddress;
    }

    public void setOwnerAddress(String ownerAddress) {
        this.ownerAddress = ownerAddress;
    }

    public String getGetToAddress() {
        return getToAddress;
    }

    public void setGetToAddress(String getToAddress) {
        this.getToAddress = getToAddress;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public long getAmount() {
        return Amount;
    }

    public void setAmount(long amount) {
        Amount = amount;
    }
}
