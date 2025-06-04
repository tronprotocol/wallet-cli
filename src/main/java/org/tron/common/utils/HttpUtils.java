package org.tron.common.utils;

import static org.apache.commons.lang3.StringUtils.EMPTY;
import static org.tron.common.utils.Utils.greenBoldHighlight;

import java.io.IOException;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.apache.commons.lang3.StringUtils;

public class HttpUtils {

  private static final OkHttpClient client = new OkHttpClient.Builder()
      .connectTimeout(10, TimeUnit.SECONDS)
      .readTimeout(15, TimeUnit.SECONDS)
      .writeTimeout(15, TimeUnit.SECONDS)
      .build();

  private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");

  public static String get(String url, Map<String, String> headers) throws IOException {
    Request.Builder builder = new Request.Builder().url(url).get();
    if (headers != null) {
      headers.forEach(builder::addHeader);
    }
    Request request = builder.build();
    try (Response response = client.newCall(request).execute()) {
      return responseBodyToString(response);
    }
  }

  public static String postJson(String url, String jsonBody, Map<String, String> headers) throws IOException {
    RequestBody body = RequestBody.create(jsonBody, JSON);
    Request.Builder builder = new Request.Builder().url(url).post(body);
    if (headers != null) {
      headers.forEach(builder::addHeader);
    }
    Request request = builder.build();
    try (Response response = client.newCall(request).execute()) {
      return responseBodyToString(response);
    }
  }

  public static String postJson(String url, String jsonBody) throws IOException {
    return postJson(url, jsonBody, null);
  }

  private static String responseBodyToString(Response response) throws IOException {
    if (!response.isSuccessful()) {
      String msg = response.message();
      if (StringUtils.isEmpty(msg) ) {
        msg = Optional.ofNullable(response.body()).map(body -> {
              try {
                return body.string();
              } catch (Exception e) {
                return EMPTY;
              }
        }).orElse(EMPTY);
      }
      if (response.code() == 502) {
        throw new IOException("Unexpected HTTP code " + response.code() + ": Bad Gateway.");
      }
      throw new IOException(
          "Unexpected HTTP code " + response.code() + ": " + msg + "\nAPI authentication failed, "
              + "please check the " + greenBoldHighlight("apikey") + " and "
              + greenBoldHighlight("apiSecret") + " configured in config.conf.");
    }
    ResponseBody body = response.body();
    return body != null ? body.string() : EMPTY;
  }
}


