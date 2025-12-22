package org.tron.keystore;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.tron.common.utils.ByteUtil.hexStringToIntegerList;
import static org.tron.multi.MultiTxSummaryParser.parse;
import static org.tron.multi.MultiTxSummaryParser.printTable;
import static org.tron.walletserver.WalletApi.encode58Check;
import static org.tron.walletserver.WalletApi.getHexAddress;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import org.junit.Assert;
import org.junit.Test;
import org.tron.common.utils.HttpUtils;
import org.tron.common.utils.MultiTxWebSocketClient;
import org.tron.core.handler.MultiTxMessageHandler;
import org.tron.core.processor.MultiTxProcessor;
import org.tron.multi.MultiConfig;
import org.tron.multi.MultiSignService;
import org.tron.multi.MultiTxSummaryParser;

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
    char[] empty = "".toCharArray();

    char[] longarr = "xxxxxxxx123xxxxxxxxx".toCharArray();
    char[] shortarr = "123".toCharArray();
    Assert.assertFalse(StringUtils.isContains(shortarr, longarr));
    Assert.assertTrue(StringUtils.isContains(longarr, shortarr));

    Assert.assertFalse(StringUtils.isContains(empty, d));
    Assert.assertFalse(StringUtils.isContains(d, empty));

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
  }

  @Test
  public void byte2Char() {
    String asc = "test";
    byte[] asc1 = asc.getBytes(UTF_8);
    byte[] asc2 = StringUtils.char2Byte(asc.toCharArray());
    Assert.assertArrayEquals(asc1, asc2);
    char[] ascChars = StringUtils.byte2Char(asc1);
    Assert.assertArrayEquals(asc.toCharArray(), ascChars);
  }

  @Test
  public void test() {
    System.out.println(hexStringToIntegerList("0c00000000000000000000000000000000000000000000000000000000000000"));
  }

  @Test
  public void testAuth() throws IOException {
    String s = HttpUtils.get("https://testlist.tronlink.org/openapi/multi/auth?address=TFdACej5gjKqSmwNNESzAbfTmBBCx55G4G&secret_id=AE68A487AA919CAE&uuid=2ddfd7d1-e0c3-442a-9f42-588c54688c01&sign=x8N9g9wShp3%3DM4un6rQscf1jg28o%3D&channel=chrome-extension&sign_version=v1&ts=1747203007411", null);
    System.out.println(s);
  }

  @Test
  public void testTransaction() {

  }

  @Test
  public void testList() {

  }

  @Test
  public void testSocket() throws InterruptedException, URISyntaxException {
//    String wsUrl = "wss://testlist.tronlink.org/openapi/multi/socket";
//    String wsUrl = "wss://niletest.tronlink.org/openapi/multi/socket";
//
//    Map<String, String> headers = new HashMap<>();
//    headers.put("sign", "x8N9g9wShp3=M4un6rQscf1jg28o=");
//
//    MultiTxMessageHandler handler = new MultiTxProcessor();
//
//    MultiTxWebSocketClient client =
//        new MultiTxWebSocketClient(new URI(wsUrl), headers, handler);
//
//    client.connectBlocking(); // 阻塞直到连接成功
//    System.out.println("WebSocket connected. Waiting for messages...");
//    new CountDownLatch(1).await();   // 主线程永不退出
  }

  @Test
  public void testMultiList() throws IOException {
    MultiConfig config = new MultiConfig(
        "https://testlist.tronlink.org",
        "AE68A487AA919CAE", // secretId
        "xxxxxxxxxxxxxxxx", // secretKey
        "wallet-cli"
    );

    MultiSignService multiSign = new MultiSignService(config);
    String pendingList = multiSign.list("TEHcUS1jdmA9yCtfh1bdrPgSk5ukRddbPr", MultiSignService.ListType.ALL, null, 0, 20);
    System.out.println(pendingList);
    List<MultiTxSummaryParser.MultiTxSummary> summaries = parse(pendingList);
    printTable(summaries);
  }

  @Test
  public void testEncodingConverter() {
    String encode58Check = encode58Check("412E988A386A799F506693793C6A5AF6B54DFAABFB".getBytes());
    System.out.println(encode58Check);

    String hex = getHexAddress("TEDapYSVvAZ3aYH7w8N9tMEEFKaNKUD5Bp").toUpperCase();
    System.out.println(hex);
  }
}