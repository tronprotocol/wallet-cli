package org.tron.common.utils;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.Assert;
import org.junit.Test;
import org.tron.protos.Protocol.Permission;

/**
 * Verifies that Utils.formatMessageString produces valid JSON and preserves
 * string field values that contain commas.
 *
 * Regression test for: JsonFormatUtil.formatJson inserting literal newlines
 * inside JSON string values when the value contains a comma character.
 */
public class FormatMessageStringTest {

  private static void assertStrictlyValidJson(String json) {
    boolean inStr = false;
    boolean esc = false;
    for (int i = 0; i < json.length(); i++) {
      char c = json.charAt(i);
      if (esc) { esc = false; continue; }
      if (c == '\\' && inStr) { esc = true; continue; }
      if (c == '"') { inStr = !inStr; continue; }
      if (inStr && c < 0x20) {
        Assert.fail("Unescaped control char 0x" + Integer.toHexString(c)
            + " at position " + i + " in JSON output (comma-in-string corruption)");
      }
    }
  }

  @Test
  public void formatMessageStringWithCommaInStringFieldProducesValidJson() {
    Permission msg = Permission.newBuilder()
        .setPermissionName("owner, admin")
        .build();

    String result = Utils.formatMessageString(msg);

    assertStrictlyValidJson(result);
  }

  @Test
  public void formatMessageStringPreservesStringValueContainingComma() {
    Permission msg = Permission.newBuilder()
        .setPermissionName("owner, admin")
        .build();

    String result = Utils.formatMessageString(msg);
    JsonObject obj = JsonParser.parseString(result).getAsJsonObject();

    Assert.assertEquals("owner, admin", obj.get("permission_name").getAsString());
  }

  @Test
  public void formatMessageStringPreservesStringValueWithMultipleCommas() {
    Permission msg = Permission.newBuilder()
        .setPermissionName("owner, admin, viewer")
        .build();

    String result = Utils.formatMessageString(msg);
    assertStrictlyValidJson(result);

    JsonObject obj = JsonParser.parseString(result).getAsJsonObject();
    Assert.assertEquals("owner, admin, viewer", obj.get("permission_name").getAsString());
  }
}
