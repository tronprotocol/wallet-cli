package org.tron.ledger.sdk;

import java.util.Arrays;

public class ByteArrayBuilder {
  private byte[] data;
  private int size;

  public ByteArrayBuilder() {
    data = new byte[64];
    size = 0;
  }

  public void append(byte[] newData, int offset, int length) {
    ensureCapacity(size + length);
    System.arraycopy(newData, offset, data, size, length);
    size += length;
  }

  public int size() {
    return size;
  }

  public byte[] toByteArray() {
    return Arrays.copyOf(data, size);
  }

  private void ensureCapacity(int minCapacity) {
    if (minCapacity > data.length) {
      int newCapacity = Math.max(data.length * 2, minCapacity);
      data = Arrays.copyOf(data, newCapacity);
    }
  }
}