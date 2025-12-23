package org.tron.multi;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class Permission {
  private String operations;
  private int threshold;
  private int weight;
}

