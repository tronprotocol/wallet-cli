package org.tron.gasfree.response;

import com.alibaba.fastjson.annotation.JSONField;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class GasFreeAddressResponse {
  @JSONField(ordinal = 1)
  private String gasFreeAddress;
  @JSONField(ordinal = 2)
  private Boolean active;
  @JSONField(ordinal = 3)
  private Long tokenBalance;
  @JSONField(ordinal = 4)
  private Long activateFee;
  @JSONField(ordinal = 5)
  private Long transferFee;
  @JSONField(ordinal = 6)
  private Long maxTransferValue;
}
