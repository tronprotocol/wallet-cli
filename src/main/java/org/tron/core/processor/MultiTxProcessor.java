package org.tron.core.processor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.tron.core.handler.MultiTxMessageHandler;

public class MultiTxProcessor implements MultiTxMessageHandler {

  private static final ObjectMapper mapper = new ObjectMapper();


  @Override
  public void onTxMessage(String json) {
    System.out.println("===" + json);
//    try {
//      JsonNode arr = mapper.readTree(json);
//
//      for (JsonNode tx : arr) {
//        int isSign = tx.get("is_sign").asInt();
//        if (isSign == 1) {
//          continue; // 已签过名，不用处理
//        }
//
//        // 获取 raw_data_hex
//        String rawDataHex = tx.get("current_transaction")
//            .get("raw_data_hex").asText();
//
//        // 你需要对 raw_data_hex 做签名，这里调用你自己的钱包逻辑
////        String signature = sign(rawDataHex);
////
////        // 提交到 /openapi/multi/transaction
////        submitSignature(tx.get("hash").asText(), signature);
//      }
//    } catch (Exception e) {
//      e.printStackTrace();
//    }
  }


}

