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

/**
 * @author venshine
 */
public class CheckStrength {

  public enum LEVEL {
    EASY, MIDIUM, STRONG, VERY_STRONG, EXTREMELY_STRONG
  }

  private static final int NUM = 1;
  private static final int SMALL_LETTER = 2;
  private static final int CAPITAL_LETTER = 3;
  private static final int OTHER_CHAR = 4;
  /**
   * Simple password dictionary
   */
  private final static String[] DICTIONARY = {"password", "abc123", "iloveyou", "adobe123",
      "123123", "sunshine",
      "1314520", "a1b2c3", "123qwe", "aaa111", "qweasd", "admin", "passwd", "passw0rd", "p@ssw0rd",
      "p@ssword"};

  /**
   * Check character's type, includes num, capital letter, small letter and other character.
   */
  private static int checkCharacterType(char c) {
    if (c >= 48 && c <= 57) {
      return NUM;
    }
    if (c >= 65 && c <= 90) {
      return CAPITAL_LETTER;
    }
    if (c >= 97 && c <= 122) {
      return SMALL_LETTER;
    }
    return OTHER_CHAR;
  }

  /**
   * Count password's number by different type
   */
  private static int[] countLetter(String passwd) {
    int[] count = {0, 0, 0, 0, 0};
    if (null != passwd && passwd.length() > 0) {
      for (char c : passwd.toCharArray()) {
        count[checkCharacterType(c)]++;
      }
    }
    return count;
  }

  private static int sameCharacter(String passwd) {
    int maxTimes = 0;
    int times = 1;
    char last = 0xff;
    for (char c : passwd.toCharArray()) {
      if (c == last) {
        times++;
      } else {
        if (times > maxTimes) {
          maxTimes = times;
        }
        times = 1;
      }
      last = c;
    }
    if (times > maxTimes) {
      maxTimes = times;
    }
    return maxTimes;
  }

  private static int adjacentCharacter(String passwd) {
    int maxTimes = 0;
    int times = 1;
    char last = 0xff;
    int lasetType = -1;
    for (char c : passwd.toCharArray()) {
      if (checkCharacterType(c) == lasetType && c == (char) (last + 1)) {
        times++;
      } else {
        if (times > maxTimes) {
          maxTimes = times;
        }
        times = 1;
      }
      last = c;
      lasetType = checkCharacterType(c);
    }
    if (times > maxTimes) {
      maxTimes = times;
    }
    return maxTimes;
  }

  /**
   * Check password's strength
   *
   * @return strength level
   */
  public static int checkPasswordStrength(String passwd) {
    if (StringUtils.equalsNull(passwd)) {
      throw new IllegalArgumentException("password is empty");
    }
    int len = passwd.length();
    int level = 0;

    int[] counts = countLetter(passwd);
    // increase points
    if (counts[NUM] > 0) {
      level++;
    }
    if (counts[SMALL_LETTER] > 0) {
      level++;
    }
    if (len > 4 && counts[CAPITAL_LETTER] > 0) {
      level++;
    }
    if (len > 6 && counts[OTHER_CHAR] > 0) {
      level++;
    }

    int typeNum = 0;
    for (int count : counts) {
      if (count > 0) {
        typeNum++;
      }
    }

    if (len > 4 && typeNum >= 2) {
      level++;
    }

    if (len > 6 && typeNum >= 3) {
      level++;
    }

    if (len > 8 && typeNum == 4) {
      level++;
    }

    if (len > 6 &&
        (counts[NUM] >= 3 && counts[SMALL_LETTER] >= 3
            || counts[NUM] >= 3 && counts[CAPITAL_LETTER] >= 3
            || counts[NUM] >= 3 && counts[OTHER_CHAR] >= 2
            || counts[SMALL_LETTER] >= 3 && counts[CAPITAL_LETTER] >= 3
            || counts[SMALL_LETTER] >= 3 && counts[OTHER_CHAR] >= 2
            || counts[CAPITAL_LETTER] >= 3 && counts[OTHER_CHAR] >= 2)) {
      level++;
    }

    if (len > 8 &&
        (counts[NUM] >= 2 && counts[SMALL_LETTER] >= 2 && counts[CAPITAL_LETTER] >= 2
            || counts[NUM] >= 2 && counts[SMALL_LETTER] >= 2 && counts[OTHER_CHAR] >= 2
            || counts[NUM] >= 2 && counts[CAPITAL_LETTER] >= 2 && counts[OTHER_CHAR] >= 2
            || counts[SMALL_LETTER] >= 2 && counts[CAPITAL_LETTER] >= 2
            && counts[OTHER_CHAR] >= 2)) {
      level++;
    }

    if (len > 10 && counts[NUM] >= 2 && counts[SMALL_LETTER] >= 2 && counts[CAPITAL_LETTER] >= 2
        && counts[OTHER_CHAR] >= 2) {
      level++;
    }

    if (counts[OTHER_CHAR] >= 3) {
      level++;
    }
    if (counts[OTHER_CHAR] >= 6) {
      level++;
    }

    if (len > 12) {
      level++;
      if (len >= 16) {
        level++;
      }
    }

    // decrease points
    if ("abcdefghijklmnopqrstuvwxyz".indexOf(passwd) > 0
        || "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(passwd) > 0) {
      level--;
    }
    if ("qwertyuiop".indexOf(passwd) > 0 || "asdfghjkl".indexOf(passwd) > 0
        || "zxcvbnm".indexOf(passwd) > 0) {
      level--;
    }
    if (StringUtils.isNumeric(passwd) && ("01234567890".indexOf(passwd) > 0
        || "09876543210".indexOf(passwd) > 0)) {
      level--;
    }

    if (counts[NUM] == len || counts[SMALL_LETTER] == len || counts[CAPITAL_LETTER] == len) {
      level--;
    }

    if (len % 2 == 0) { // aaabbb
      String part1 = passwd.substring(0, len / 2);
      String part2 = passwd.substring(len / 2);
      if (part1.equals(part2)) {
        level--;
      }
      if (StringUtils.isCharEqual(part1) && StringUtils.isCharEqual(part2)) {
        level--;
      }
    }
    if (len % 3 == 0) { // ababab
      String part1 = passwd.substring(0, len / 3);
      String part2 = passwd.substring(len / 3, len / 3 * 2);
      String part3 = passwd.substring(len / 3 * 2);
      if (part1.equals(part2) && part2.equals(part3)) {
        level--;
      }
    }

    int times = sameCharacter(passwd);
    if (times >= 4) {
      level -= (times - 3);
    }

    times = adjacentCharacter(passwd);
    if (times >= 4) {
      level -= (times - 3);
    }

    if (StringUtils.isNumeric(passwd) && len >= 6) { // 19881010 or 881010
      int year = 0;
      if (len == 8 || len == 6) {
        year = Integer.parseInt(passwd.substring(0, len - 4));
      }
      int size = StringUtils.sizeOfInt(year);
      int month = Integer.parseInt(passwd.substring(size, size + 2));
      int day = Integer.parseInt(passwd.substring(size + 2, len));
      if (year >= 1950 && year < 2050 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        level--;
      }
    }

    if (null != DICTIONARY && DICTIONARY.length > 0) {// dictionary
      for (int i = 0; i < DICTIONARY.length; i++) {
        if (passwd.equals(DICTIONARY[i]) || DICTIONARY[i].indexOf(passwd) >= 0 || passwd.indexOf(DICTIONARY[i]) >=0) {
          level--;
          break;
        }
      }
    }

    if (len <= 6) {
      level--;
      if (len <= 4) {
        level--;
        if (len <= 3) {
          level = 0;
        }
      }
    }

    if (StringUtils.isCharEqual(passwd)) {
      level = 0;
    }

    if (level < 0) {
      level = 0;
    }

    return level;
  }

  /**
   * Get password strength level, includes easy, midium, strong, very strong, extremely strong
   */
  public static LEVEL getPasswordLevel(String passwd) {
    int level = checkPasswordStrength(passwd);
    switch (level) {
      case 0:
      case 1:
      case 2:
      case 3:
        return LEVEL.EASY;
      case 4:
      case 5:
      case 6:
        return LEVEL.MIDIUM;
      case 7:
      case 8:
      case 9:
        return LEVEL.STRONG;
      case 10:
      case 11:
      case 12:
        return LEVEL.VERY_STRONG;
      default:
        return LEVEL.EXTREMELY_STRONG;
    }
  }

}