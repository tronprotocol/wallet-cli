package org.tron.gasfree.request;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class GasFreeSubmitRequest {
  private String token;
  private String serviceProvider;
  private String user;
  private String receiver;
  private Long value;
  private Long maxFee;
  private Long deadline;
  private Integer version;
  private Integer nonce;
  private String sig;
}
