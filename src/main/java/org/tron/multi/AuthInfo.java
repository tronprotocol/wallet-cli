package org.tron.multi;

import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AuthInfo {
  private String ownerAddress;
  private Permission ownerPermission;
  private List<Permission> activePermissions;
}

