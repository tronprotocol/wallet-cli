package org.tron.common.utils;

import java.util.ArrayList;
import java.util.List;
import javax.xml.bind.SchemaOutputResolver;

public class AbiUtil {
  static abstract class Coder {
    boolean dynamic = false;
    String name;
    String type;

//    DataWord[] encode
    abstract byte[] encode(String value);
    abstract byte[] decode();

  }

  class Paramater {
    String type;
  }


//  public static  String coderNumber(String coerceFunc, int size, String signed, String localName) {
//
//
//  }

//  public static List<Coder>

  public static String[] getTypes(String methodSign) {
    int start = methodSign.indexOf('(') + 1;
    int end = methodSign.indexOf(')');

    String typeSring = methodSign.subSequence(start,end).toString();

    return typeSring.split(",");
  }

  public static String geMethodId(String methodSign) {
    return null;
  }



  public static Coder getParamCoder(String type) {

    switch (type) {
      case "address":
        return new CoderAddress();
      case "string":
        return new StringAddress();
    }

    return null;
  }

  static class CoderAddress extends Coder {

    @Override
    byte[] encode(String value) {
      return new byte[0];
    }

    @Override
    byte[] decode() {
      return new byte[0];
    }
  }

  static class StringAddress extends  Coder {
    StringAddress() {
      dynamic = true;
    }

    @Override
    byte[] encode(String value) {
      return new byte[0];
    }

    @Override
    byte[] decode() {
      return new byte[0];
    }
  }

  public static int alignSize(int size) {
    return 32 * (size / 32 + 1);
  }

  public static List<DataWord> encodeDynamicBytes(String value) {

    int len = value.getBytes().length;
    int padding =



  }

  public static byte[] pack(List<Coder> codes, List<String> values) {
    int staticSize = 0;
    int dynamicSize = 0;

    List<byte[]> encodedList = new ArrayList<>();

    for (int idx = 0;idx < codes.size();  idx++) {
      Coder coder = codes.get(idx);
      String value = values.get(idx);

      byte[] encoded = coder.encode(value);

      encodedList.add(encoded);

      if (coder.dynamic) {
        staticSize += 32;
        dynamicSize += alignSize(encoded.length);
      } else {
        staticSize += alignSize(encoded.length);
      }
    }

    int offset = 0;
    int dynamicOffset = staticSize;

    byte[] data = new byte[staticSize + dynamicSize];

    for (int idx = 0; idx < codes.size(); idx++) {
      Coder coder = codes.get(idx);
//      String value = values.get(idx);

      if (coder.dynamic) {
        System.arraycopy(new DataWord(dynamicOffset).getData(), 0,data, offset, DataWord.WordBytesLen);
        offset += DataWord.WordBytesLen;

        System.arraycopy(encodedList.get(idx), 0,data, dynamicOffset, encodedList.get(idx).length );
        dynamicSize += encodedList.get(idx).length;
      } else {
        System.arraycopy(encodedList.get(idx), 0,data, offset, DataWord.WordBytesLen);
        offset += DataWord.WordBytesLen;
      }
    }

    return data;
  }

  public  static void main(String[] args) {
//    String method = "test(address,string,int)";
    String method = "test(string)";
    String params = "111";

    String[] vs = params.split(",");
    List<String> values1 = new ArrayList<>();
    for (String v: vs) {
      values1.add(v);
    }

    List<Coder> coders = new ArrayList<>();

    for (String s: getTypes(method)) {
      Coder c = getParamCoder(s);
      coders.add(c);
    }

    System.out.println(pack(coders, values1));

  }



}
