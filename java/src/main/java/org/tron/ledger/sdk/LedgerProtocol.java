package org.tron.ledger.sdk;

import java.nio.Buffer;
import java.nio.ByteBuffer;

import static org.tron.common.utils.ByteArray.toHexString;
import static org.tron.ledger.sdk.CommonUtil.hexStringToByteArray;

public class LedgerProtocol {
  public static class CommException extends RuntimeException {
    public CommException(String message) {
      super(message);
    }
  }

  /**
   * Wraps command APDU for Ledger protocol
   */
  public static byte[] wrapCommandAPDU(int channel, byte[] command, int packetSize, boolean ble) {
    if (packetSize < 3) {
      throw new CommException("Can't handle Ledger framing with less than 3 bytes for the report");
    }

    int sequenceIdx = 0;
    int offset = 0;
    int extraHeaderSize = ble ? 0 : 2;
    int estimatedSize = command.length +
        (command.length / (packetSize - 5 - extraHeaderSize) + 1) * (5 + extraHeaderSize) +
        packetSize;
    ByteBuffer result = ByteBuffer.allocate(estimatedSize);
    if (!ble) {
      result.putShort((short) channel);
    }
    result.put((byte) 0x05);                  // tag
    result.putShort((short) sequenceIdx);     // sequence
    result.putShort((short) command.length);  // command length
    sequenceIdx++;

    int blockSize = Math.min(
        command.length,
        packetSize - 5 - extraHeaderSize
    );

    result.put(command, offset, blockSize);
    offset += blockSize;

    while (offset < command.length) {
      if (!ble) {
        result.putShort((short) channel);
      }
      result.put((byte) 0x05);
      result.putShort((short) sequenceIdx);
      sequenceIdx++;

      blockSize = Math.min(
          command.length - offset,
          packetSize - 3 - extraHeaderSize
      );
      result.put(command, offset, blockSize);
      offset += blockSize;
    }
    if (!ble) {
      while (result.position() % packetSize != 0) {
        result.put((byte) 0x00);
      }
    }

    byte[] finalResult = new byte[result.position()];
    ((Buffer) result).rewind();// JDK compatibility settings, cannot remove forced conversion type
    result.get(finalResult);
    return finalResult;
  }

  /**
   * Unwraps response APDU from Ledger protocol
   */
  public static byte[] unwrapResponseAPDU(int channel, byte[] data, int packetSize, boolean ble) {
    int sequenceIdx = 0;
    int offset = 0;
    int extraHeaderSize = ble ? 0 : 2;

    if (data == null || data.length < 5 + extraHeaderSize + 5) {
      return null;
    }

    try {
      if (!ble) {
        int receivedChannel = ((data[offset] & 0xFF) << 8) | (data[offset + 1] & 0xFF);
        if (receivedChannel != channel) {
          throw new CommException("Invalid channel");
        }
        offset += 2;
      }
      if (data[offset] != 0x05) {
        throw new CommException("Invalid tag");
      }
      offset += 1;
      int receivedSequence = ((data[offset] & 0xFF) << 8) | (data[offset + 1] & 0xFF);
      if (receivedSequence != sequenceIdx) {
        throw new CommException("Invalid sequence");
      }
      offset += 2;
      int responseLength = ((data[offset] & 0xFF) << 8) | (data[offset + 1] & 0xFF);
      offset += 2;
      if (data.length < 5 + extraHeaderSize + responseLength) {
        return null;
      }
      int blockSize = Math.min(
          responseLength,
          packetSize - 5 - extraHeaderSize
      );

      ByteArrayBuilder result = new ByteArrayBuilder();
      result.append(data, offset, blockSize);
      offset += blockSize;

      while (result.size() < responseLength) {
        sequenceIdx++;

        if (offset >= data.length) {
          return null;
        }

        if (!ble) {
          int nextChannel = ((data[offset] & 0xFF) << 8) | (data[offset + 1] & 0xFF);
          if (nextChannel != channel) {
            throw new CommException("Invalid channel");
          }
          offset += 2;
        }

        if (data[offset] != 0x05) {
          throw new CommException("Invalid tag");
        }
        offset += 1;
        receivedSequence = ((data[offset] & 0xFF) << 8) | (data[offset + 1] & 0xFF);
        if (receivedSequence != sequenceIdx) {
          throw new CommException("Invalid sequence");
        }
        offset += 2;

        blockSize = Math.min(
            responseLength - result.size(),
            packetSize - 3 - extraHeaderSize
        );
        result.append(data, offset, blockSize);
        offset += blockSize;
      }

      return result.toByteArray();
    } catch (Exception e) {
      throw new CommException("Error unwrapping APDU response: " + e.getMessage());
    }
  }

  public static void main(String[] args) {
    /*
    final int CHANNEL = 0x0101;
    final int PACKET_SIZE = 64;

    //hex reponsee:
    //Response:
    //Response: 010105000000435303fcf4ec1e61280ec17fc47bdd51e937952f2e35a4796c9f6aa26eb3b211d44c098874ba633193afc984b41ab40030f25b496a259c13cf4a01010500019f45cc298e279301900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
    String response = "01010500000002698500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    byte[] byteRes = hexStringToByteArray(response);
    //System.out.println("Response: " + byteRes);
    byte[] unwrapped = LedgerProtocol.unwrapResponseAPDU(
        CHANNEL, byteRes, PACKET_SIZE, false);
    System.out.println("Unwrapped hex: " + toHexString(unwrapped));

    String response2 = "010105000000435303fcf4ec1e61280ec17fc47bdd51e937952f2e35a4796c9f6aa26eb3b211d44c098874ba633193afc984b41ab40030f25b496a259c13cf4a01010500019f45cc298e279301900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    byte[] byteRes2 = hexStringToByteArray(response2);
    //System.out.println("Response: " + byteRes);
    byte[] unwrapped2 = LedgerProtocol.unwrapResponseAPDU(
        CHANNEL, byteRes2, PACKET_SIZE, false);
    System.out.println("Unwrapped2 hex: " + toHexString(unwrapped2));
     */
  }
}