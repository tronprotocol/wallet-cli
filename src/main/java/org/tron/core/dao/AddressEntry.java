package org.tron.core.dao;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AddressEntry {
  private String name;
  private String address;
  private String note;

  public AddressEntry(String name, String address, String note) {
    this.name = name;
    this.address = address;
    this.note = note;
  }

  @Override
  public String toString() {
    return String.format("%-15s %-35s %s", name, address, note == null ? "" : note);
  }

  public String toFileString() {
    return String.join(",", name, address, note == null ? "" : note);
  }
}
