package org.tron.core.dao;

import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class BackupRecord {
  private String command;
  private String walletName;
  private String ownerAddress;
  private LocalDateTime timestamp;

  public BackupRecord(String command, String walletName, String ownerAddress, LocalDateTime timestamp) {
    this.command = command;
    this.walletName = walletName;
    this.ownerAddress = ownerAddress;
    this.timestamp = timestamp;
  }

  @Override
  public String toString() {
    return "BackupRecord{" +
        "command='" + command + '\'' +
        ", walletName='" + walletName + '\'' +
        ", ownerAddress='" + ownerAddress + '\'' +
        ", timestamp=" + timestamp +
        '}';
  }
}
