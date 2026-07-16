package org.tron.ledger.console;

import lombok.Getter;
import lombok.Setter;

import java.util.Objects;

public class ImportAccount {
  @Getter
  private final String path;
  @Getter
  private final String address;
  @Getter
  private final boolean isGen;

  public ImportAccount(String path, String address, boolean isGen) {
    this.path = path;
    this.address = address;
    this.isGen = isGen;
  }

  @Override
  public String toString() {
    return "ImportAccount{" +
        "path='" + path + '\'' +
        ", address='" + address + '\'' +
        ", isGen=" + isGen +
        '}';
  }

  @Override
  public boolean equals(Object obj) {
    if (this == obj) return true;
    if (obj == null || getClass() != obj.getClass()) return false;
    ImportAccount account = (ImportAccount) obj;
    return isGen == account.isGen &&
        Objects.equals(path, account.path) &&
        Objects.equals(address, account.address);
  }

  @Override
  public int hashCode() {
    return Objects.hash(path, address, isGen);
  }
}

