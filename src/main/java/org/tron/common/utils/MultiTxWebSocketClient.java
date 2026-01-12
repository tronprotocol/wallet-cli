package org.tron.common.utils;

import static org.tron.common.utils.Utils.greenBoldHighlight;
import static org.tron.common.utils.Utils.yellowBoldHighlight;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import java.net.URI;
import java.util.Map;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.jline.reader.LineReader;

public class MultiTxWebSocketClient extends WebSocketClient {

  private final LineReader lineReader;
  private final String subscribeJson;

  public MultiTxWebSocketClient(URI serverUri, Map<String, String> headers,
                                LineReader lineReader,
                                String address) {
    super(serverUri, headers);
    this.lineReader = lineReader;
    this.subscribeJson = String.format(
        "{\"address\":\"%s\",\"version\":\"v1\"}", address
    );
  }

  @Override
  public void onOpen(ServerHandshake handshake) {
    send(subscribeJson);

//    lineReader.printAbove(
//        greenBoldHighlight("🔗 WebSocket connected, subscribed address")
//    );
  }

  public static boolean isJsonArray(String str) {
    if (str == null) return false;

    str = str.trim();
    if (!str.startsWith("[") || !str.endsWith("]")) {
      return false;
    }

    try {
      JSON.parseArray(str);
      return true;
    } catch (Exception e) {
      return false;
    }
  }

  @Override
  public void onMessage(String message) {
    if (!isJsonArray(message)) {
      return;
    }
    JSONArray jsonArray = JSON.parseArray(message);
    long count = jsonArray.stream()
        .map(o -> (JSONObject) o)
        .filter(obj -> obj.getIntValue("is_sign") == 0
            && obj.getIntValue("state") == 0)
        .count();
    if (count > 0) {
      lineReader.printAbove(
          yellowBoldHighlight("🔔 New message: ") + "You have " + count + " transaction(s) to be signed, please view it through the " + greenBoldHighlight("TronlinkMultiSign") + " command."
      );
    }
  }

  @Override
  public void onClose(int code, String reason, boolean remote) {
//    lineReader.printAbove(
//        redBoldHighlight("❌ WebSocket closed: " + reason)
//    );
  }

  @Override
  public void onError(Exception ex) {
//    lineReader.printAbove(
//        redBoldHighlight("❌ WebSocket error: " + ex.getMessage())
//    );
  }
}


