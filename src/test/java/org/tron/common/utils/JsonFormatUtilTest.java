package org.tron.common.utils;

import com.google.gson.JsonParser;
import com.google.gson.JsonSyntaxException;
import org.junit.Assert;
import org.junit.Test;

public class JsonFormatUtilTest {

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Parse with strict mode (not Gson lenient). */
  private static void assertStrictlyValidJson(String json) {
    try {
      // Gson lenient would hide the bug, so parse with Jackson-style strictness via
      // a hand-rolled check: control chars (0x00–0x1F) must not appear raw inside strings.
      boolean inStr = false;
      boolean esc = false;
      for (int i = 0; i < json.length(); i++) {
        char c = json.charAt(i);
        if (esc) { esc = false; continue; }
        if (c == '\\' && inStr) { esc = true; continue; }
        if (c == '"') { inStr = !inStr; continue; }
        if (inStr && c < 0x20) {
          Assert.fail("Unescaped control char 0x" + Integer.toHexString(c)
              + " at position " + i + " in: " + json.replace("\n", "\\n").replace("\t", "\\t"));
        }
      }
      // Also verify it is parseable JSON at all
      JsonParser.parseString(json);
    } catch (JsonSyntaxException e) {
      Assert.fail("Invalid JSON: " + e.getMessage() + "\nInput: " + json);
    }
  }

  private static String valueOf(String json, String key) {
    return JsonParser.parseString(json).getAsJsonObject().get(key).getAsString();
  }

  // ── tests ──────────────────────────────────────────────────────────────────

  @Test
  public void emptyStringReturnsEmpty() {
    Assert.assertEquals("", JsonFormatUtil.formatJson(""));
  }

  @Test
  public void nullStringReturnsEmpty() {
    Assert.assertEquals("", JsonFormatUtil.formatJson(null));
  }

  @Test
  public void cleanJsonWithNoCommasInValuesIsFormattedAndValid() {
    String input = "{\"balance\":1000000,\"address\":\"TXyz\"}";
    String result = JsonFormatUtil.formatJson(input);
    assertStrictlyValidJson(result);
    Assert.assertEquals("1000000", valueOf(result, "balance"));
    Assert.assertEquals("TXyz", valueOf(result, "address"));
  }

  @Test
  public void commaInsideStringValueProducesStrictlyValidJson() {
    String input = "{\"name\":\"hello, world\",\"balance\":1000}";
    String result = JsonFormatUtil.formatJson(input);
    assertStrictlyValidJson(result);
  }

  @Test
  public void commaInsideStringValuePreservesOriginalValue() {
    String input = "{\"name\":\"hello, world\",\"balance\":1000}";
    String result = JsonFormatUtil.formatJson(input);
    Assert.assertEquals("hello, world", valueOf(result, "name"));
  }

  @Test
  public void multipleCommasInsideStringValueAreAllPreserved() {
    String input = "{\"description\":\"BitTorrent Token, utility token, TRON\",\"balance\":500}";
    String result = JsonFormatUtil.formatJson(input);
    assertStrictlyValidJson(result);
    Assert.assertEquals("BitTorrent Token, utility token, TRON", valueOf(result, "description"));
  }

  @Test
  public void escapedQuoteInsideStringDoesNotConfuseStringBoundaryTracking() {
    String input = "{\"abbr\":\"US\\\"D,T\",\"name\":\"Tether\"}";
    String result = JsonFormatUtil.formatJson(input);
    assertStrictlyValidJson(result);
    Assert.assertEquals("US\"D,T", valueOf(result, "abbr"));
  }

  @Test
  public void escapedBackslashFollowedByCommaIsPreserved() {
    // "\\" is a single backslash inside the string; comma after it is part of value
    String input = "{\"path\":\"C:\\\\dir, files\",\"ok\":true}";
    String result = JsonFormatUtil.formatJson(input);
    assertStrictlyValidJson(result);
    Assert.assertEquals("C:\\dir, files", valueOf(result, "path"));
  }

  @Test
  public void nestedObjectsAreFormattedAndValid() {
    String input = "{\"outer\":{\"inner\":42,\"label\":\"a, b\"},\"top\":1}";
    String result = JsonFormatUtil.formatJson(input);
    assertStrictlyValidJson(result);
  }

  @Test
  public void arrayOfStringsWithCommasIsValid() {
    String input = "[\"hello, world\",\"foo, bar\"]";
    String result = JsonFormatUtil.formatJson(input);
    assertStrictlyValidJson(result);
  }
}
