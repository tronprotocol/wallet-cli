package org.tron.core.config;

public interface Parameter {

  interface CommonConstant {
    byte ADD_PRE_FIX_BYTE = (byte) 0xa0;   //a0 + address  ,a0 is version
    String ADD_PRE_FIX_STRING = "a0";
    int ADDRESS_SIZE = 42;
  }

}
