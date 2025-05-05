/*
 * Copyright (C) 2014 venshine.cn@gmail.com
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.tron.keystore;

import org.apache.commons.lang3.ArrayUtils;

/**
 * @author venshine
 */
public class StringUtils {

  /**
   * Judge whether each character of the string equals
   */
  public static boolean isCharEqual(char[] str) {
    char c0 = str[0];
    for (char c : str) {
      if (c != c0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Determines if the string is a digit
   */
  public static boolean isNumeric(char[] str) {
    for (char c : str) {
      if (!Character.isDigit(c)) {
        return false;
      }
    }
    return true;
  }

  /**
   * a Contains b , return true
   *
   * @return boolean
   */
  public static boolean isContains(char[] a, char[] b) {
    if (ArrayUtils.isEmpty(a) || ArrayUtils.isEmpty(b)) {
      return false;
    }

    int alen = a.length;
    int blen = b.length;

    for (int i = 0; i < alen; i++) {
      if (alen - i < blen) {
        return false;
      }
      int j;
      for (j = 0; j < blen; j++) {
        if (a[i + j] != b[j]) {
          break;
        }
      }
      if (j == blen) {
        return true;
      }
    }
    return false;
  }

  public static void clear(char[] a) {
    if (ArrayUtils.isEmpty(a)) {
      return;
    }
    for (int i = 0; i < a.length; i++) {
      a[i] = 0;
    }
  }

  public static void clear(byte[] a) {
    if (ArrayUtils.isEmpty(a)) {
      return;
    }
    for (int i = 0; i < a.length; i++) {
      a[i] = 0;
    }
  }

  /**
   * char to utf-8 bytes
   */
  public static byte[] char2Byte(char[] a) {
    int len = 0;
    for (char c : a) {
      if (c > 0x7FF) {
        len += 3;
      } else if (c > 0x7F) {
        len += 2;
      } else {
        len++;
      }
    }

    byte[] result = new byte[len];
    int i = 0;
    for (char c : a) {
      if (c > 0x7FF) {
        result[i++] = (byte) (((c >> 12) & 0x0F) | 0xE0);
        result[i++] = (byte) (((c >> 6) & 0x3F) | 0x80);
        result[i++] = (byte) ((c & 0x3F) | 0x80);
      } else if (c > 127) {
        result[i++] = (byte) (((c >> 6) & 0x1F) | 0xC0);
        result[i++] = (byte) ((c & 0x3F) | 0x80);
      } else {
        result[i++] = (byte) (c & 0x7F);
      }
    }
    return result;
  }

  /**
   * utf-8 bytes to chars
   */
  public static char[] byte2Char(byte[] a) {
    int len = 0;
    for (int i = 0; i < a.length; ) {
      byte b = a[i];
      if ((b & 0x80) == 0) {
        i++;  // 0xxxxxxx
      } else if ((b & 0xE0) == 0xC0) {
        i += 2; // 110xxxxx 10xxxxxx
      } else if ((b & 0xF0) == 0xE0) {
        i += 3; // 1110xxxx 10xxxxxx 10xxxxxx
      } else {
        i++;  // unsupport
      }
      len++;
    }

    char[] result = new char[len];
    int j = 0;
    for (int i = 0; i < a.length; ) {
      byte b = a[i];
      if ((b & 0x80) == 0) {
        i++;
        result[j++] = (char) b; // 0xxxxxxx
        continue;
      }
      if ((b & 0xE0) == 0xC0 && a.length - i >= 2) {
        result[j++] = (char) ((a[i + 1] & 0x3F) | (b & 0x1F) << 6);
        i += 2;
        continue;
      }
      if ((b & 0xF0) == 0xE0 && a.length - i >= 2) {
        result[j++] = (char) ((a[i + 2] & 0x3F) | ((a[i + 1] & 0x3F) << 6) | ((b & 0x0F) << 12));
        i += 3;
        continue;
      }
      i++;
      result[j++] = (char) b; // other
    }
    return result;
  }

  public static void printOneByte(byte b) {
    int d = (b >> 4) & 0x0F;
    if (d >= 10) {
      System.out.print((char) (d - 10 + 'a'));
    } else {
      System.out.print(d);
    }

    d = b & 0x0F;
    if (d >= 10) {
      System.out.print((char) (d - 10 + 'a'));
    } else {
      System.out.print(d);
    }

    d = 0;
  }

  public static byte[] hexs2Bytes(byte[] a) {
    if (ArrayUtils.isEmpty(a)) {
      return null;
    }
    if ((a.length & 0x01) != 0) {
      return null;
    }
    byte[] result = new byte[a.length / 2];
    for (int i = 0; i < result.length; i++) {
      byte h = a[i * 2];
      byte l = a[i * 2 + 1];
      if (h >= '0' && h <= '9') {
        result[i] = (byte) ((h - '0') << 4);
      } else if (h >= 'a' && h <= 'f') {
        result[i] = (byte) ((h - 'a' + 10) << 4);
      } else if (h >= 'A' && h <= 'F') {
        result[i] = (byte) ((h - 'A' + 10) << 4);
      } else {
        return null;
      }

      if (l >= '0' && l <= '9') {
        result[i] += (l - '0');
      } else if (l >= 'a' && l <= 'f') {
        result[i] += (l - 'a' + 10);
      } else if (l >= 'A' && l <= 'F') {
        result[i] += (l - 'A' + 10);
      } else {
        return null;
      }
      h = l = 0;
    }
    return result;
  }
}
