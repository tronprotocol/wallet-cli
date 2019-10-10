package org.tron.keystore;

import org.junit.Assert;
import org.junit.Test;

import static java.nio.charset.StandardCharsets.UTF_8;

public class StringUtilsTest {


  @Test
  public void isCharEqual() {
    char[] a = "aaaaaa".toCharArray();
    char[] b = "aaaaab".toCharArray();
    Assert.assertTrue(StringUtils.isCharEqual(a));
    Assert.assertFalse(StringUtils.isCharEqual(b));
  }

  @Test
  public void isNumeric() {
    char[] a = "0123456".toCharArray();
    char[] b = "123456a".toCharArray();
    Assert.assertTrue(StringUtils.isNumeric(a));
    Assert.assertFalse(StringUtils.isNumeric(b));
  }

  @Test
  public void isContains() {
    char[] a = "abcdef".toCharArray();
    char[] b = "ghijkl".toCharArray();
    char[] c = "defghi".toCharArray();
    char[] d = "abcdefghijkl".toCharArray();
    Assert.assertTrue(StringUtils.isContains(d, d));
    Assert.assertTrue(StringUtils.isContains(d, a));
    Assert.assertTrue(StringUtils.isContains(d, b));
    Assert.assertTrue(StringUtils.isContains(d, c));

    Assert.assertFalse(StringUtils.isContains(a, d));
    Assert.assertFalse(StringUtils.isContains(b, d));
    Assert.assertFalse(StringUtils.isContains(c, d));

    Assert.assertFalse(StringUtils.isContains(a, b));
    Assert.assertFalse(StringUtils.isContains(b, a));
    Assert.assertFalse(StringUtils.isContains(b, c));
    Assert.assertFalse(StringUtils.isContains(c, b));
    Assert.assertFalse(StringUtils.isContains(a, c));
    Assert.assertFalse(StringUtils.isContains(c, a));

    char[] e = "abcabcdef".toCharArray();
    char[] f = "abcdef".toCharArray();
    Assert.assertTrue(StringUtils.isContains(e, f));

    char[] g = "abababcdef".toCharArray();
    char[] h = "ababcdef".toCharArray();
    Assert.assertTrue(StringUtils.isContains(g, h));
  }

  @Test
  public void clear() {
    byte[] chars1 = "test".getBytes();
    byte[] chars2 = new byte[chars1.length];
    StringUtils.clear(chars1);
    Assert.assertArrayEquals(chars1, chars2);
  }

  @Test
  public void clear1() {
    char[] chars1 = "test".toCharArray();
    char[] chars2 = new char[chars1.length];
    StringUtils.clear(chars1);
    Assert.assertArrayEquals(chars1, chars2);
  }

  @Test
  public void char2Byte() {
    String asc = "test";
    byte[] asc1 = asc.getBytes(UTF_8);
    byte[] asc2 = StringUtils.char2Byte(asc.toCharArray());
    Assert.assertArrayEquals(asc1, asc2);

//    String china = "中国";
//    byte[] china1 = china.getBytes(UTF_8);
//    byte[] china2 = StringUtils.char2Byte(china.toCharArray());
//    Assert.assertArrayEquals(china1, china2);
//
//    String mix = "中1华。人】民、共、和、国";
//    byte[] mix1 = mix.getBytes(UTF_8);
//    byte[] mix2 = StringUtils.char2Byte(mix.toCharArray());
//    Assert.assertArrayEquals(mix1, mix2);
  }

  @Test
  public void byte2Char() {
    String asc = "test";
    byte[] asc1 = asc.getBytes(UTF_8);
    byte[] asc2 = StringUtils.char2Byte(asc.toCharArray());
    Assert.assertArrayEquals(asc1, asc2);
    char[] ascChars = StringUtils.byte2Char(asc1);
    Assert.assertArrayEquals(asc.toCharArray(), ascChars);

//    String china = "中国";
//    byte[] china1 = china.getBytes(UTF_8);
//    byte[] china2 = StringUtils.char2Byte(china.toCharArray());
//    Assert.assertArrayEquals(china1, china2);
//    char[] chinaChars = StringUtils.byte2Char(china1);
//    Assert.assertArrayEquals(china.toCharArray(), chinaChars);
//
//    String mix = "中1华。人】民、共、和、国";
//    byte[] mix1 = mix.getBytes(UTF_8);
//    byte[] mix2 = StringUtils.char2Byte(mix.toCharArray());
//    Assert.assertArrayEquals(mix1, mix2);
//    char[] mixChars = StringUtils.byte2Char(mix1);
//    Assert.assertArrayEquals(mix.toCharArray(), mixChars);
  }
}