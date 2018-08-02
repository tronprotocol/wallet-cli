package org.tron.common.utils;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.bouncycastle.util.encoders.Hex;
import org.springframework.util.Assert;
import org.tron.common.crypto.Hash;
import org.tron.walletserver.WalletClient;
import com.fasterxml.jackson.databind.ObjectMapper;

public class AbiUtil {

  static Pattern paramTypeBytes = Pattern.compile("^bytes([0-9]*)$");
  static Pattern paramTypeNumber = Pattern.compile("^(u?int)([0-9]*)$");
  static Pattern paramTypeArray = Pattern.compile("^(.*)\\[([0-9]*)\\]$");

//  var paramTypeBytes = new RegExp(/^bytes([0-9]*)$/);
//  var paramTypeNumber = new RegExp(/^(u?int)([0-9]*)$/);
//  var paramTypeArray = new RegExp(/^(.*)\[([0-9]*)\]$/);
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
        return new CoderString();
      case "bool":
        return new CoderBool();
      case "bytes":
        return new CoderDynamicBytes();
    }

    boolean match = false;

    if (type.matches("^bytes([0-9]*)$"))
      return new CoderFixedBytes();

    if (type.matches("^(u?int)([0-9]*)$"))
      return new CoderNumber();


    Pattern r = Pattern.compile("^(.*)\\[([0-9]*)]$");
    Matcher m = r.matcher(type);
    if (m.find()) {
      String arrayType = m.group(1);
      int length = -1;
      if (!m.group(2).equals("")) {
        length = Integer.valueOf(m.group(2));
      }
      return new CoderArray(arrayType, length);
    }
//    if (type.matches("^(.*)\\[([0-9]*)\\]$"))
//      return new CoderArray();

    return null;
  }

  static class CoderArray extends Coder {
    private String elementType;
    private int length;
    public CoderArray(String arrayType, int length) {
      this.elementType = arrayType;
      this.length = length;
      if (length == -1) {
        this.dynamic = true;
      }
      this.dynamic = true;
    }

    @Override
    byte[] encode(String arrayValues) {

      Coder coder = getParamCoder(elementType);


      List<Object> strings = null;
      try {
        ObjectMapper mapper = new ObjectMapper();
        strings = mapper.readValue(arrayValues, List.class);
      } catch (IOException e) {
        e.printStackTrace();
      }

      List<Coder> coders = new ArrayList<>();

      if (this.length == -1) {
        for (int i = 0; i < strings.size(); i++) {
          coders.add(coder);
        }
      } else {
        for (int i = 0; i < this.length; i++) {
          coders.add(coder);
        }
      }

//      String[] values = arrayValues.split(",");

      if (this.length == -1) {
        System.out.println("array encoded");
        System.out.println(Hex.toHexString(concat(new DataWord(strings.size()).getData(), pack(coders, strings))));
        System.out.println("fdsfsdf");
        return concat(new DataWord(strings.size()).getData(), pack(coders, strings));
      } else {
        System.out.println(Hex.toHexString(pack(coders, strings)));

        return pack(coders, strings);
      }
    }

    @Override
    byte[] decode() {
      return new byte[0];
    }
  }

  static class CoderNumber extends  Coder {

    @Override
    byte[] encode(String value) {
      return new DataWord(Long.valueOf(value)).getData();
    }

    @Override
    byte[] decode() {
      return new byte[0];
    }
  }

//  static class

  static class CoderFixedBytes extends  Coder {

    @Override
    byte[] encode(String value) {
      if (value.startsWith("0x")) {
        return new DataWord(value.substring(2)).getData();
      } else {
        return new DataWord(value).getData();
      }
    }

    @Override
    byte[] decode() {
      return new byte[0];
    }
  }

  static class CoderDynamicBytes extends  Coder {

    CoderDynamicBytes() {
      dynamic = true;
    }

    @Override
    byte[] encode(String value) {
      return encodeDynamicBytes(value);
    }

    @Override
    byte[] decode() {
      return new byte[0];
    }
  }

  static class CoderBool extends  Coder {

    @Override
    byte[] encode(String value) {
      if (value.equals("true") || value.equals("1")) {
        return new DataWord(1).getData();
      } else {
        return new DataWord(0).getData();
      }

    }

    @Override
    byte[] decode() {
      return new byte[0];
    }
  }

  static class CoderAddress extends Coder {

    @Override
    byte[] encode(String value) {
      byte[] address = WalletClient.decodeFromBase58Check(value);
      return new DataWord(address).getData();
    }

    @Override
    byte[] decode() {
      return new byte[0];
    }
  }

//  static class

  static class CoderString extends  Coder {
    CoderString() {
      dynamic = true;
    }

    @Override
    byte[] encode(String value) {
      return encodeDynamicBytes(value);
    }

    @Override
    byte[] decode() {
      return new byte[0];
    }
  }

  public static byte[] encodeDynamicBytes(String value) {
    byte[] data = value.getBytes();
    List<DataWord> ret = new ArrayList<>();

    ret.add(new DataWord(data.length));

    int readInx = 0;
    int len = value.getBytes().length;
    while (readInx < value.getBytes().length) {
      byte[] wordData = new byte[32];

//      int left = len - readInx;
      int readLen = len - readInx >= 32 ? 32 : (len - readInx);
      System.arraycopy(data, readInx, wordData, 0, readLen);
      DataWord word = new DataWord(wordData);
      ret.add(word);
      readInx += 32;
    }

    byte[] retBytes = new byte[ret.size() * 32];
    int retIndex = 0;

    for (DataWord w : ret) {
      System.arraycopy(w.getData(), 0, retBytes, retIndex, 32);
      retIndex += 32;
    }

    return retBytes;
  }
  public static byte[] pack(List<Coder> codes, List<Object> values) {

    int staticSize = 0;
    int dynamicSize = 0;

    List<byte[]> encodedList = new ArrayList<>();

    for (int idx = 0;idx < codes.size();  idx++) {
      Coder coder = codes.get(idx);
      String value = values.get(idx).toString();

      byte[] encoded = coder.encode(value);

      encodedList.add(encoded);

      if (coder.dynamic) {
        staticSize += 32;
        dynamicSize += encoded.length;
      } else {
        staticSize += 32;
      }
    }

    int offset = 0;
    int dynamicOffset = staticSize;

    byte[] data = new byte[staticSize + dynamicSize];

    for (int idx = 0; idx < codes.size(); idx++) {
      Coder coder = codes.get(idx);
//      String value = values.get(idx);

      if (coder.dynamic) {
        System.arraycopy(new DataWord(dynamicOffset).getData(), 0,data, offset, 32);
        offset += 32;

        System.arraycopy(encodedList.get(idx), 0,data, dynamicOffset, encodedList.get(idx).length );
        dynamicOffset += encodedList.get(idx).length;

      } else {
        System.arraycopy(encodedList.get(idx), 0,data, offset, 32);
        offset += 32;
      }
    }

    return data;
  }

  public static String parseMethod(String methodSign, String params) {
    return parseMethod(methodSign, params, false);
  }

  public static String parseMethod(String methodSign, String params, boolean isHex) {
    byte[] selector = new byte[4];
    System.arraycopy(Hash.sha3(methodSign.getBytes()), 0, selector,0, 4);
    System.out.println(methodSign + ":" + Hex.toHexString(selector));
    if (params.length() == 0) {
      return Hex.toHexString(selector);
    }
    if (isHex) {
      return Hex.toHexString(selector) + params;
    }
    String[] values = params.split(",");
    ObjectMapper mapper = new ObjectMapper();

    params = "[" + params + "]";
    List<Object> strings = null;
    try {
      strings = mapper.readValue(params, List.class);
    } catch (IOException e) {
      e.printStackTrace();
    }

    List<Coder> coders = new ArrayList<>();
    for (String s: getTypes(methodSign)) {
      Coder c = getParamCoder(s);
      coders.add(c);
    }

    byte[] encodedParms = pack(coders, strings);

    return Hex.toHexString(selector) + Hex.toHexString(encodedParms);
  }

  public  static void main(String[] args) {
//    String method = "test(address,string,int)";
    String method = "test(string,int2,string)";
    String params = "asdf,3123,adf";

    String arrayMethod1 = "test(uint,uint256[3])";
    String arrayMethod2 = "test(uint,uint256[])";
    String arrayMethod3 = "test(uint,address[])";

//    String listString = "[\"A\",\"B\",\"C   \"，1]";
    String method1 = "test(uint256,string,string,uint256[])";
    String expected1  = "db103cf30000000000000000000000000000000000000000000000000000000000000005000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000014200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000143000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003";
    String method2 = "test(uint256,string,string,uint256[3])";
    String expected2 = "";
    String listString = "5 ,\"B\",\"C\", [1, 2, 3]";

    String listString1 = "[1, 2, 3]";
    String method3 = "test(uint256[])";
    String method4 = "test(uint256[3])";


    System.out.println("");

//    System.out.println(parseMethod(method3, listString1));

    System.out.println(parseMethod(method4, listString1));
//    Assert.isTrue(parseMethod(method1, listString).equals(expected1));
//
//    Assert.isTrue(parseMethod(method2, listString).equals(expected2));


//    List<String> strList =
//    String jsonString="[{'id':'1'},{'id':'2'}]";
//    List<Bean> beanList = mapper.readValue(jsonString, new TypeReference<List<Bean>>() {});



//    System.out.println(parseMethod(method, params));
//    parseMethod(method, params);

//    String[] vs = params.split(",");
//    List<String> values1 = new ArrayList<>();
//    for (String v: vs) {
//      values1.add(v);
//    }
//
//    List<Coder> coders = new ArrayList<>();
//
//    for (String s: getTypes(method)) {
//      Coder c = getParamCoder(s);
//      coders.add(c);
//    }
//
//    byte[] dd = pack(coders,values1);
//
//    System.out.println(Hex.toHexString(dd));




//    System.out.println(Hex.encode(pack(coders, values1)));

  }

  public static byte[] concat(byte[] ... bytesArray) {
    int length = 0;
    for (byte[] bytes: bytesArray) {
      length += bytes.length;
    }
    byte[] ret = new byte[length];
    int index = 0;
    for(byte[] bytes: bytesArray) {
      System.arraycopy(bytes, 0, ret, index, bytes.length);
      index += bytes.length;
    }
    return ret;
  }



}
