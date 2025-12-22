package org.tron.multi;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class MultiConfig {

  private String baseUrl;   // https://testlist.tronlink.org
  private String secretId;
  private String secretKey;
  private String channel;   // chrome-extension / tronlink

  public MultiConfig(String baseUrl, String secretId, String secretKey, String channel) {
    this.baseUrl = baseUrl;
    this.secretId = secretId;
    this.secretKey = secretKey;
    this.channel = channel;
  }
}

