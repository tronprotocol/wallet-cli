package org.tron.explorer.domain;

import java.util.List;

public class VoteWitness {

  private String ownerAddress;

  private List<Witness> witnessList;

  public VoteWitness(String ownerAddress, List<Witness> witnessList) {
    this.ownerAddress = ownerAddress;
    this.witnessList = witnessList;
  }

  public VoteWitness() {
  }


  public String getOwnerAddress() {
    return ownerAddress;
  }

  public void setOwnerAddress(String ownerAddress) {
    this.ownerAddress = ownerAddress;
  }

  public List<Witness> getWitnessList() {
    return witnessList;
  }

  public void setWitnessList(List<Witness> witnessList) {
    this.witnessList = witnessList;
  }
}
