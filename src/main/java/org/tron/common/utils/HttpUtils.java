package org.tron.common.utils;

import static org.apache.commons.lang3.StringUtils.EMPTY;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import okhttp3.FormBody;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

public class HttpUtils {

  private static final OkHttpClient client = new OkHttpClient.Builder()
      .connectTimeout(10, TimeUnit.SECONDS)
      .readTimeout(15, TimeUnit.SECONDS)
      .writeTimeout(15, TimeUnit.SECONDS)
      .build();

  private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");
  private static final MediaType FORM = MediaType.parse("application/x-www-form-urlencoded; charset=utf-8");

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

  // POST 请求 - 表单格式
  public static String postForm(String url, Map<String, String> formParams, Map<String, String> headers) throws IOException {
    FormBody.Builder formBuilder = new FormBody.Builder();
    if (formParams != null) {
      formParams.forEach(formBuilder::add);
    }

    Request.Builder builder = new Request.Builder()
        .url(url)
        .post(formBuilder.build());

    if (headers != null) {
      headers.forEach(builder::addHeader);
    }

    Request request = builder.build();
    try (Response response = client.newCall(request).execute()) {
      return responseBodyToString(response);
    }
  }

  private static String responseBodyToString(Response response) throws IOException {
    if (!response.isSuccessful()) {
      throw new IOException("Unexpected HTTP code " + response.code() + ": " + response.message());
    }
    ResponseBody body = response.body();
    return body != null ? body.string() : EMPTY;
  }
}


