package org.tron.keystore;


import org.tron.common.crypto.SignInterface;

public interface Credentials {
  SignInterface getPair();

  String getAddress();
}
