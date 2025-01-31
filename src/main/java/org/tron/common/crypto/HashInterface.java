package org.tron.common.crypto;

import com.google.protobuf.ByteString;

public interface HashInterface {

    byte[] getBytes();

    ByteString getByteString();

}
