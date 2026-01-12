package org.tron.multi;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import lombok.Getter;
import lombok.Setter;
import org.apache.commons.lang3.tuple.Pair;

public class MultiTxSummaryParser {

  @Getter
  @Setter
  public static class MultiTxSummary {
    private long timestamp;
    private String hash;
    private String contractType;
    private String ownerAddress;
    private JSONObject currentTransaction;
    private JSONArray signatureProgress;
    private int currentWeight;
    private int threshold;
    private int state;
    private int isSign;

    public String getSignProgress() {
      return currentWeight + "/" + threshold;
    }
  }

  public static Pair<List<MultiTxSummary>, Integer> parse(String jsonStr) {
    JSONObject root = JSON.parseObject(jsonStr);
    JSONObject data = root.getJSONObject("data");
    int rangeTotal = data.getIntValue("range_total");
    JSONArray dataArray = data.getJSONArray("data");
    List<MultiTxSummary> list = new ArrayList<>();

    for (int i = 0; i < dataArray.size(); i++) {
      JSONObject item = dataArray.getJSONObject(i);
      MultiTxSummary summary = new MultiTxSummary();
      summary.setHash(item.getString("hash"));
      summary.setContractType(item.getString("contract_type"));
      summary.setState(item.getIntValue("state"));
      summary.setIsSign(item.getIntValue("is_sign"));
      summary.setCurrentWeight(item.getIntValue("current_weight"));
      summary.setThreshold(item.getIntValue("threshold"));
      summary.setOwnerAddress(item.getJSONObject("contract_data").getString("owner_address"));
      summary.setTimestamp(item.getJSONObject("current_transaction")
          .getJSONObject("raw_data")
          .getLongValue("timestamp"));
      summary.setCurrentTransaction(item.getJSONObject("current_transaction"));
      summary.setSignatureProgress(item.getJSONArray("signature_progress"));
      list.add(summary);
    }

    return Pair.of(list, rangeTotal);
  }

  public static String formatTimestamp(long ts) {
    Date date = new Date(ts);
    SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
    return sdf.format(date);
  }

  public static void printTable(List<MultiTxSummary> list) {
    System.out.printf("%-5s %-20s %-31s %-35s %-10s %-5s%n",
        "No.", "Create Time", "Contract Type", "Owner Address", "Sign Progress", "State");
    System.out.println("-------------------------------------------------------------------------------------------------------------------------");
    int index = 1;
    for (MultiTxSummary s : list) {
      System.out.printf("%-5d %-20s %-31s %-35s %-13s %-5s%n",
          index++,
          formatTimestamp(s.getTimestamp()),
          s.getContractType(),
          s.getOwnerAddress(),
          s.getSignProgress(),
          MultiSignService.ListType.from(s.getState(), s.getIsSign()).name().toLowerCase());
    }
  }

}

