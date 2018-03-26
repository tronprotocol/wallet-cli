package org.tron.explorer.domain;

import java.util.List;

public class VoteWitness {
  private String owner;
  private List<Witness> list;

  public String getOwner() {
    return owner;
  }

  public void setOwner(String owner) {
    this.owner = owner;
  }

  public List<Witness> getList() {
    return list;
  }

  public void setList(List<Witness> list) {
    this.list = list;
  }

  public VoteWitness(String owner, List<Witness> list) {
    this.owner = owner;
    this.list = list;
  }

  public VoteWitness(){

  }
}
