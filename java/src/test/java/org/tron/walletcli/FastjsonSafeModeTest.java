package org.tron.walletcli;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONException;
import com.alibaba.fastjson.JSONObject;
import com.alibaba.fastjson.parser.ParserConfig;
import org.junit.Assert;
import org.junit.BeforeClass;
import org.junit.Test;

public class FastjsonSafeModeTest {

  @BeforeClass
  public static void loadClient() throws Exception {
    // Client's static initializer is what enables safe mode for the shipped binary.
    Class.forName(Client.class.getName());
  }

  @Test
  public void clientEnablesFastjsonSafeMode() {
    Assert.assertTrue(ParserConfig.getGlobalInstance().isSafeMode());
  }

  @Test
  public void safeModeRejectsAutoTypeHint() {
    String payload = "{\"@type\":\"com.sun.rowset.JdbcRowSetImpl\","
        + "\"dataSourceName\":\"ldap://127.0.0.1:1389/exploit\",\"autoCommit\":true}";
    try {
      JSON.parseObject(payload);
      Assert.fail("safe mode must reject the @type autoType hint");
    } catch (JSONException e) {
      Assert.assertTrue(e.getMessage(), e.getMessage().contains("safeMode"));
    }
  }

  @Test
  public void safeModeStillParsesOrdinaryPayloads() {
    JSONObject parsed = JSON.parseObject("{\"address\":\"TXyz\",\"balance\":42}");

    Assert.assertEquals("TXyz", parsed.getString("address"));
    Assert.assertEquals(42, parsed.getIntValue("balance"));
  }
}
