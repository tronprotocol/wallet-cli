package org.tron.core.dao;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Objects;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class Tx {
  private String id;
  private String type;
  private String from;
  private String to;
  private String amount;
  private LocalDateTime timestamp;
  private String status;
  private String note;

  public Tx() {
  }

  public Tx(String id, String type, String from, String to, String amount, LocalDateTime timestamp, String status, String note) {
    this.id = Objects.requireNonNull(id);
    this.type = Objects.requireNonNull(type);
    this.from = Objects.requireNonNull(from);
    this.to = Objects.requireNonNull(to);
    this.amount = amount;
    this.timestamp = timestamp;
    this.status = Objects.requireNonNull(status);
    this.note = note;
  }

  public boolean isRelatedTo(String address) {
    return from.equalsIgnoreCase(address) || to.equalsIgnoreCase(address);
  }

  @Override
  public String toString() {
    return String.format("Tx[id=%s, type=%s, from=%s, to=%s, amount=%d, timestamp=%s, status=%s]",
        id,
        type,
        from,
        to,
        amount,
        timestamp.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
        status);
  }

  private String abbreviate(String address) {
    return address.length() > 8
        ? address.substring(0, 6) + "..." + address.substring(address.length() - 4)
        : address;
  }
}
