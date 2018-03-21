package org.tron.explorer.domain;

import java.util.List;

public class VoteWitness {

  String ownerAddress;
  List<Witness> list;

  public VoteWitness(String ownerAddress, List<Witness> list) {
    this.ownerAddress = ownerAddress;
    this.list = list;
  }

  public VoteWitness() {
  }

  public String getOwnerAddress() {
    return ownerAddress;
  }

  public void setOwnerAddress(String ownerAddress) {
    this.ownerAddress = ownerAddress;
  }

  public List<Witness> getList() {
    return list;
  }

  public void setList(List<Witness> list) {
    this.list = list;
  }
}
