package org.tron.core.zen;

import io.netty.util.internal.StringUtil;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.concurrent.ConcurrentHashMap;
import lombok.Getter;
import lombok.Setter;

public class ShieldAddressList {
  @Setter
  @Getter
  Map<String, ShieldAddressInfo>  shieldAddressInfoMap = new ConcurrentHashMap();
  private final static String FileName = "shieldAddress.txt";

  public boolean init() {
    loadAddressFromFile();
    return true;
  }

  /**
   * 从文件中获取每个地址
   */
  public boolean loadAddressFromFile() {
    List<String> addressList = ZenUtils.getListFromFile( FileName );

    shieldAddressInfoMap.clear();
    for (String addressString : addressList ) {
      ShieldAddressInfo addressInfo = new ShieldAddressInfo();
      if ( addressInfo.decode(addressString) ) {
        shieldAddressInfoMap.put(addressInfo.getAddress(), addressInfo);
      } else {
        System.out.println("*******************");
      }
    }
    return true;
  }

  /**
   * 将获取的地址添加到地址列表中
   * @param addressInfo
   * @return
   */
  public boolean appendAddressInfoToFile(final ShieldAddressInfo addressInfo ) {
    String shieldAddress = addressInfo.getAddress();
    if ( !StringUtil.isNullOrEmpty( shieldAddress ) ) {
      String addressString = addressInfo.encode();
      ZenUtils.appendToFileTail(FileName, addressString);

      shieldAddressInfoMap.put(shieldAddress, addressInfo);
    }
    return true;
  }

  public List<String> getShieldAddressList() {
    List<String>  addressList = new ArrayList<>();
    for (Entry<String, ShieldAddressInfo> entry : shieldAddressInfoMap.entrySet()) {
      addressList.add(entry.getKey());
    }
    return addressList;
  }
}
