package org.tron.multi;

import static org.apache.commons.lang3.StringUtils.EMPTY;
import static org.tron.common.utils.TransactionUtils.getTransactionId;
import static org.tron.common.utils.Utils.greenBoldHighlight;
import static org.tron.common.utils.Utils.intToBooleanString;
import static org.tron.trident.proto.Chain.Transaction.Contract.ContractType.CancelAllUnfreezeV2Contract;
import static org.tron.trident.proto.Chain.Transaction.Contract.ContractType.DelegateResourceContract;
import static org.tron.trident.proto.Chain.Transaction.Contract.ContractType.FreezeBalanceV2Contract;
import static org.tron.trident.proto.Chain.Transaction.Contract.ContractType.TransferContract;
import static org.tron.trident.proto.Chain.Transaction.Contract.ContractType.TriggerSmartContract;
import static org.tron.trident.proto.Chain.Transaction.Contract.ContractType.UnDelegateResourceContract;
import static org.tron.trident.proto.Chain.Transaction.Contract.ContractType.UnfreezeBalanceV2Contract;
import static org.tron.trident.proto.Chain.Transaction.Contract.ContractType.VoteWitnessContract;
import static org.tron.trident.proto.Chain.Transaction.Contract.ContractType.WithdrawBalanceContract;
import static org.tron.trident.proto.Chain.Transaction.Contract.ContractType.WithdrawExpireUnfreezeContract;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.google.common.collect.Sets;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Scanner;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.bouncycastle.util.encoders.Hex;
import org.tron.common.crypto.Sha256Sm3Hash;
import org.tron.common.utils.HttpUtils;
import org.tron.core.exception.CipherException;
import org.tron.trident.proto.Chain;
import org.tron.trident.proto.Chain.Transaction.Contract.ContractType;
import org.tron.walletserver.WalletApi;

public class MultiSignService {

  private static final String NUMBER_TO_OPERATE = "Please enter to operate: ";

  private final MultiConfig config;
  public static final Set<ContractType> CONTRACT_TYPE_SET = EnumSet.of(
      TransferContract,
      TriggerSmartContract,
      FreezeBalanceV2Contract,
      UnfreezeBalanceV2Contract,
      CancelAllUnfreezeV2Contract,
      WithdrawExpireUnfreezeContract,
      DelegateResourceContract,
      UnDelegateResourceContract,
      VoteWitnessContract,
      WithdrawBalanceContract
  );

  public MultiSignService(MultiConfig config) {
    this.config = config;
  }

  private String uuid() {
    return UUID.randomUUID().toString();
  }

  private String ts() {
    return String.valueOf(System.currentTimeMillis());
  }

  public static String hmacSHA256(String text, String key) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(key.getBytes(), "HmacSHA256"));
      return encode(mac.doFinal(text.getBytes()));
    } catch (Exception e) {
      throw new RuntimeException("Error while calculating HMAC SHA256", e);
    }
  }

  /**
   * @param bstr
   * @return String
   */
  private static String encode(byte[] bstr) {
    String s = System.getProperty("line.separator");
    return Base64.getEncoder().encodeToString(bstr).replaceAll(s, "");
  }

  private String buildSortedParamString(Map<String, String> params) {
    List<String> keys = new ArrayList<>(params.keySet());
    Collections.sort(keys);
    StringBuilder sb = new StringBuilder();
    for (String key : keys) {
      sb.append(key).append("=").append(params.get(key)).append("&");
    }
    sb.deleteCharAt(sb.length() - 1);
    return sb.toString();
  }

  private String sign(String method, String path, Map<String, String> params) {
    String sorted = buildSortedParamString(params);
    String signText = method.toUpperCase() + path + "?" + sorted;
    return hmacSHA256(signText, config.getSecretKey());
  }

  public String signWebsocket(String path, Map<String, String> params) {
    params.put("sign_version", "v1");
    params.put("channel", config.getChannel());
    params.put("secret_id", config.getSecretId());
    params.put("ts", ts());
    params.put("uuid", uuid());
    return sign("GET", path, params);
  }

  public String signedGet(String path, Map<String, String> params) throws IOException {

    params.put("sign_version", "v1");
    params.put("channel", config.getChannel());
    params.put("secret_id", config.getSecretId());
    params.put("ts", ts());
    params.put("uuid", uuid());

    Set<String> keepKeys = Sets.newHashSet("sign_version", "address", "channel", "secret_id", "ts", "uuid");
    Map<String, String> newMap = params.entrySet()
        .stream()
        .filter(e -> keepKeys.contains(e.getKey()))
        .collect(Collectors.toMap(
            Map.Entry::getKey,
            Map.Entry::getValue
        ));


    params.put("sign", sign("GET", path, newMap));
//    params.put("sign", "x8N9g9wShp3=M4un6rQscf1jg28o=");

    StringBuilder url = new StringBuilder(config.getBaseUrl()).append(path).append("?");

    for (Map.Entry<String, String> e : params.entrySet()) {
      url.append(URLEncoder.encode(e.getKey(), "UTF-8"))
          .append("=")
          .append(URLEncoder.encode(e.getValue(), "UTF-8"))
          .append("&");
    }
    url.deleteCharAt(url.length() - 1);

    return HttpUtils.get(url.toString(), null);
  }

  public enum ListType {
    ALL(255, null),
    TO_BE_SIGNED(0, 0),
    SIGNED(0, 1),
    SUCCESS(1, null),
    FAILED(2, null);

    private static final Map<String, ListType> CACHE = new HashMap<>();

    static {
      for (ListType type : values()) {
        CACHE.put(key(type.state, type.isSign), type);
      }
    }

    public final Integer state;
    public final Integer isSign;

    ListType(Integer state, Integer isSign) {
      this.state = state;
      this.isSign = isSign;
    }

    private static String key(Integer state, Integer isSign) {
      if (state == 0) {
        return state + "_" + isSign;
      } else {
        return String.valueOf(state);
      }
    }

    public static ListType from(Integer state, Integer isSign) {
      return CACHE.get(key(state, isSign));
    }
  }

  public String list(String address, ListType type, Integer isSign, int start, int limit) throws IOException {
    Map<String, String> params = new HashMap<>();
    params.put("address", address);
    params.put("start", String.valueOf(start));
    params.put("limit", String.valueOf(limit));
    params.put("state", String.valueOf(type.state));
    if (isSign != null) {
      params.put("is_sign", intToBooleanString(isSign));
    }
    return signedGet("/openapi/multi/list", params);
  }

  public String createTransaction(String address,
                                  String permissionName,
                                  String txId,
                                  String rawDataJson,
                                  String type) throws IOException {

    Map<String, String> params = new HashMap<>();
    params.put("address", address);
    params.put("permission_name", permissionName);
    params.put("tx_id", txId);

    params.put("sign_version", "v1");
    params.put("channel", config.getChannel());
    params.put("secret_id", config.getSecretId());
    params.put("ts", ts());
    params.put("uuid", uuid());

//    params.put("sign", sign("POST", "/openapi/multi/transaction", params));
//    params.put("sign", "x8N9g9wShp3=M4un6rQscf1jg28o=");
    params.put("sign", sign("POST", "/openapi/multi/transaction", params));

    StringBuilder url = new StringBuilder(config.getBaseUrl()).append("/openapi/multi/transaction").append("?");

    for (Map.Entry<String, String> e : params.entrySet()) {
      url.append(URLEncoder.encode(e.getKey(), "UTF-8"))
          .append("=")
          .append(URLEncoder.encode(e.getValue(), "UTF-8"))
          .append("&");
    }
    url.deleteCharAt(url.length() - 1);

    JsonObject body = new JsonObject();
    body.addProperty("raw_data", rawDataJson);
    JsonObject extra = new JsonObject();
    extra.addProperty("type", type);
    body.add("extra", extra);

    return HttpUtils.postJson(url.toString(), body.toString());
  }

  public void runCLI(String address, WalletApi wallet) {
    Scanner scanner = new Scanner(System.in);

    while (true) {
      System.out.println("\n=== Multi-Sign Manager ===");
      System.out.println("1. Multi-sign transaction list");
      System.out.println("2. Create multi-sign transaction");
      System.out.println("0. Exit");
      System.out.print(NUMBER_TO_OPERATE);
      String choice = scanner.nextLine().trim();
      switch (choice) {
        case "1":
          showTransactionMenu(scanner, address, wallet);
          break;
        case "2":
          createMultiSignTransaction();
          break;
        case "0":
          return;
        default:
          System.out.println("Invalid input.");
      }
    }
  }

  private void createMultiSignTransaction() {
    System.out.println("\nPlease add the '" + greenBoldHighlight("-m") + "' parameter at the end of the command line to create multi-sign transactions, for example:");
    System.out.println("wallet> SendCoin TEDapYSVvAZ3aYH7w8N9tMEEFKaNKUD5Bp 1000000 -m");
    System.out.println("The currently supported transaction types are:");
    CONTRACT_TYPE_SET.forEach(contractType -> System.out.println(greenBoldHighlight(contractType.name())));
  }

//  private void createMultiSignTransaction(Scanner scanner, String address, WalletApi wallet) {
//    System.out.println("\n=== Create Multi-Sign Transaction ===");
//    System.out.println("Select transaction type:");
//    System.out.println("1. Transfer");
//    System.out.println("2. Stake");
//    System.out.println("3. UnStake");
//    System.out.println("4. Cancel UnStake");
//    System.out.println("5. Withdraw Expire UnStake");
//    System.out.println("6. Delegate Resource");
//    System.out.println("7. UnDelegate Resource");
//    System.out.println("8. Vote Witness");
//    System.out.println("9. Withdraw Balance");
//    System.out.println("0. Cancel");
//    System.out.print(NUMBER_TO_OPERATE);
//
//    String choice = scanner.nextLine().trim();
//    if ("0".equals(choice)) {
//      return;
//    }
//    if (!"1".equals(choice)) {
//      System.out.println("Unsupported type.");
//      return;
//    }
//
//    // ---- TRX Transfer ----
//    System.out.print("Control (from) address: ");
//    String from = scanner.nextLine().trim();
//    if (StringUtils.isEmpty(from)) {
//      from = address;
//    }
//    System.out.print("Receiver (to) address: ");
//    String to = scanner.nextLine().trim();
//
//    System.out.print("Amount (SUN): ");
//    long amount = Long.parseLong(scanner.nextLine().trim());
//
//    System.out.println("Permission type:");
//    System.out.println("1. owner");
//    System.out.println("2. active");
//    System.out.print(NUMBER_TO_OPERATE);
//    String p = scanner.nextLine().trim();
//
//    int permissionId = "1".equals(p) ? 0 : 2;
//    String permissionName = permissionId == 0 ? "owner" : "active";
//
//    // ---- Confirm ----
//    System.out.println("\nConfirm transaction:");
//    System.out.println("From      : " + from);
//    System.out.println("To        : " + to);
//    System.out.println("Amount    : " + amount + " SUN");
//    System.out.println("Permission: " + permissionName);
//
//    System.out.println("\n1. Confirm and submit");
//    System.out.println("0. Cancel");
//    System.out.print(NUMBER_TO_OPERATE);
//
//    if (!"1".equals(scanner.nextLine().trim())) {
//      return;
//    }
//
//    try {
//      JSONObject tx = buildAndSignTransferTx(from, to, amount, wallet);
//      String resp = submitMultiSignTx(from, tx);
//      System.out.println("\nCreate result:");
//      System.out.println(resp);
//    } catch (Exception e) {
//      System.out.println("Create failed: " + e.getMessage());
//    }
//  }

  public String submitMultiSignTx(String address, JSONObject transaction)
      throws IOException {

    Map<String, String> params = new HashMap<>();
    params.put("sign_version", "v1");
    params.put("channel", config.getChannel());
    params.put("secret_id", config.getSecretId());
    params.put("ts", ts());
    params.put("uuid", uuid());
    params.put("address", address);

//    params.put("sign", "x8N9g9wShp3=M4un6rQscf1jg28o=");
    params.put("sign", sign("POST", "/openapi/multi/transaction", params));

    String url = config.getBaseUrl()
        + "/openapi/multi/transaction?"
        + buildQuery(params);

    JSONObject body = new JSONObject();
    body.put("address", address);
    body.put("transaction", transaction);

    return HttpUtils.postJson(url, body.toJSONString());
  }

  public static Chain.Transaction updateExpiration(
      Chain.Transaction tx,
      long newExpirationMillis) {
    if (tx == null) {
      throw new IllegalArgumentException("transaction is null");
    }

    Chain.Transaction.raw raw = tx.getRawData();

    Chain.Transaction.raw.Builder rawBuilder = raw.toBuilder();
    rawBuilder.setExpiration(newExpirationMillis);

    return tx.toBuilder()
        .setRawData(rawBuilder.build())
        .build();
  }


//  private JSONObject buildAndSignTransferTx(
//      String from,
//      String to,
//      long amount,
//      WalletApi wallet) throws IllegalException, IOException, CipherException {
//    Response.TransactionExtention transactionExtention = wallet.transferTE(from, to, amount);
//    Chain.Transaction transaction = transactionExtention.getTransaction();
//    Chain.Transaction.raw raw = transaction.getRawData();
//    transaction = updateExpiration(transaction, raw.getExpiration() - TRANSACTION_DEFAULT_EXPIRATION_TIME + (24L * 3600 * 1000));
//    String printTransaction = Utils.printTransaction(transaction);
//    JSONObject transactionJO = JSON.parseObject(printTransaction);
//    transactionJO.put("visible", true);
//    JSONArray signatures = new JSONArray();
//    byte[] hash = Sha256Sm3Hash.hash(transaction.getRawData().toByteArray());
//    String signature = wallet.signTransaction(hash);
//    signatures.add(signature);
//    transactionJO.put("signature", signatures);
//    return transactionJO;
//  }

  private void showTransactionMenu(Scanner scanner, String address, WalletApi wallet) {
    ListType currentType = ListType.ALL;
    Integer isSign = null;
    int pageSize = 20;
    int currentPage = 0;
    while (true) {
      List<MultiTxSummaryParser.MultiTxSummary> txList =
          fetchTransactions(address, currentType, isSign, currentPage * pageSize, pageSize);
      MultiTxSummaryParser.printTable(txList);
      System.out.println("\nTip: input " + greenBoldHighlight("p/P") + " for previous page, " + greenBoldHighlight("n/N") + " for next page");
      System.out.println("\nFilter options:");
      System.out.println("1. All transactions");
      System.out.println("2. To be signed transactions");
      System.out.println("3. Signed transactions");
      System.out.println("4. Success transactions");
      System.out.println("5. Failed transactions");
      System.out.println("6. Select transaction to view/sign");
      System.out.println("0. Back");

      System.out.print(NUMBER_TO_OPERATE);
      String choice = scanner.nextLine().trim().toLowerCase();
      switch (choice) {
        case "1":
          currentType = ListType.ALL;
          isSign = null;
          currentPage = 0;
          break;
        case "2":
          currentType = ListType.TO_BE_SIGNED;
          isSign = 0;
          currentPage = 0;
          break;
        case "3":
          currentType = ListType.SIGNED;
          isSign = 1;
          currentPage = 0;
          break;
        case "4":
          currentType = ListType.SUCCESS;
          isSign = null;
          currentPage = 0;
          break;
        case "5":
          currentType = ListType.FAILED;
          isSign = null;
          currentPage = 0;
          break;
        case "6":
          System.out.print("Enter transaction number (0 to cancel): ");
          String noStr = scanner.nextLine().trim();
          if ("0".equals(noStr)) break;
          try {
            int index = Integer.parseInt(noStr) - 1;
            if (index >= 0 && index < txList.size()) {
              showTransactionDetail(address, scanner, txList.get(index), wallet);
            } else {
              System.out.println("Invalid number");
            }
          } catch (NumberFormatException e) {
            System.out.println("Invalid input");
          }
          break;
        case "p":
          if (currentPage > 0) {
            currentPage--;
          } else {
            System.out.println("Already at first page");
          }
          break;

        case "n":
          if (txList.size() == pageSize) {
            currentPage++;
          } else {
            System.out.println("No more pages");
          }
          break;
        case "0":
          return;
        default:
          System.out.println("Invalid input");
          break;
      }
    }
  }

  private List<MultiTxSummaryParser.MultiTxSummary> fetchTransactions(String address, ListType type, Integer isSign, int start,
                                                                      int limit) {
    try {
      String resp = list(address, type, isSign, start, limit);
      return MultiTxSummaryParser.parse(resp);
    } catch (Exception e) {
      System.err.println("\nError fetching transactions: " + e.getMessage() + ", Please check the secretId, secretKey and channel in config.conf.");
      return Collections.emptyList();
    }
  }

  private void showTransactionDetail(String address, Scanner scanner, MultiTxSummaryParser.MultiTxSummary tx, WalletApi wallet) {
    System.out.println("\n--- Transaction Detail ---");
    System.out.println("State: " + tx.getState());
    System.out.println("Contract Type: " + tx.getContractType());
    System.out.println("Owner Address: " + tx.getOwnerAddress());
    System.out.println("Sign Progress: " + tx.getSignProgress());
    System.out.println("Create Time: " + MultiTxSummaryParser.formatTimestamp(tx.getTimestamp()));

    System.out.println("\nActions:");
    System.out.println("1. Sign transaction");
    System.out.println("0. Back");
    System.out.print(NUMBER_TO_OPERATE);
    String choice = scanner.nextLine().trim();
    switch (choice) {
      case "1":
        doSignTransaction(address, tx.getCurrentTransaction(), wallet);
        break;
      case "0":
        return;
      default:
        System.out.println("Invalid input");
        break;
    }
  }

  private void doSignTransaction(String address, JSONObject currentTransaction, WalletApi wallet) {
    try {
      System.out.println("\nSigning transaction...");
      String resp = signTransaction(
          address,
          currentTransaction,
          wallet
      );
      JSONObject root = JSON.parseObject(resp);
      if (root.getIntValue("code") != 0) {
        throw new RuntimeException("sign failed: " + root.getString("message"));
      } else {
        System.out.println("Sign successful:");
      }
    } catch (Exception e) {
      System.out.println("Sign failed: " + e.getMessage());
    }
  }


  public String signTransaction(String address, JSONObject currentTransaction, WalletApi wallet) throws IOException, CipherException {

    Map<String, String> params = new HashMap<>();
    params.put("sign_version", "v1");
    params.put("channel", config.getChannel());
    params.put("secret_id", config.getSecretId());
    params.put("ts", ts());
    params.put("uuid", uuid());
    params.put("address", address);

    // real sign should be generated here
//    params.put("sign", "x8N9g9wShp3=M4un6rQscf1jg28o=");
    params.put("sign", sign("POST", "/openapi/multi/transaction", params));
    String url = config.getBaseUrl()
        + "/openapi/multi/transaction?"
        + buildQuery(params);

    // ===== fastjson only =====
    JSONObject body = new JSONObject();
    body.put("address", address);

    // transaction is an object, not string
    JSONArray signatureArray = currentTransaction.getJSONArray("signature");
    String rawDataHex = currentTransaction.getString("raw_data_hex");
    byte[] rawData = Hex.decode(rawDataHex);
    byte[] hash = Sha256Sm3Hash.hash(rawData);

    String signature = wallet.signTransaction(hash);

    signatureArray.add(signature);
    String txId = getTransactionId(rawDataHex).toString();
    currentTransaction.put("txID", txId);
    body.put("transaction", currentTransaction);

    return HttpUtils.postJson(url, body.toJSONString());
  }

  private String buildQuery(Map<String, String> params) throws IOException {
    StringBuilder sb = new StringBuilder();
    for (Map.Entry<String, String> e : params.entrySet()) {
      sb.append(URLEncoder.encode(e.getKey(), "UTF-8"))
          .append("=")
          .append(URLEncoder.encode(e.getValue(), "UTF-8"))
          .append("&");
    }
    sb.deleteCharAt(sb.length() - 1);
    return sb.toString();
  }

  public String getAuth(String address) throws IOException {
    Map<String, String> params = new HashMap<>();
    params.put("address", address);
    return signedGet("/openapi/multi/auth", params);
  }

  public List<AuthInfo> queryMultiAuth(String address) {
    try {
      String resp = getAuth(address);
      JSONObject root = JSON.parseObject(resp);
      if (root.getIntValue("code") != 0) {
        throw new RuntimeException("auth query failed: " + root.getString("message"));
      }

      JSONArray data = root.getJSONArray("data");
      List<AuthInfo> result = new ArrayList<>();

      for (int i = 0; i < data.size(); i++) {
        JSONObject obj = data.getJSONObject(i);

        AuthInfo info = new AuthInfo();
        info.setOwnerAddress(obj.getString("owner_address"));

        // owner permission
        JSONObject ownerPerm = obj.getJSONObject("owner_permission");
        if (ownerPerm != null) {
          Permission p = new Permission();
          p.setOperations(EMPTY);
          p.setThreshold(ownerPerm.getIntValue("threshold"));
          p.setWeight(ownerPerm.getIntValue("weight"));
          info.setOwnerPermission(p);
        }

        // active permissions
        JSONArray actives = obj.getJSONArray("active_permissions");
        if (actives != null) {
          info.setActivePermissions(new ArrayList<>());
          for (int j = 0; j < actives.size(); j++) {
            JSONObject ap = actives.getJSONObject(j);
            Permission p = new Permission();
            p.setOperations(ap.getString("operations"));
            p.setThreshold(ap.getIntValue("threshold"));
            p.setWeight(ap.getIntValue("weight"));
            info.getActivePermissions().add(p);
          }
        }

        result.add(info);
      }

      return result;
    } catch (Exception e) {
      throw new RuntimeException("queryMultiAuth error", e);
    }
  }

  private String buildSignedUrl(String path, String address) {
    try {
      Map<String, String> params = new HashMap<>();
      params.put("sign_version", "v1");
      params.put("channel", config.getChannel());
      params.put("secret_id", config.getSecretId());
      params.put("ts", ts());
      params.put("uuid", uuid());
      params.put("address", address);

      // sign text: METHOD + path + ?sorted_params
      String sign = sign("GET", path, params);
      params.put("sign", sign);

      StringBuilder url = new StringBuilder();
      url.append(config.getBaseUrl()).append(path).append("?");

      for (Map.Entry<String, String> e : params.entrySet()) {
        url.append(URLEncoder.encode(e.getKey(), "UTF-8"))
            .append("=")
            .append(URLEncoder.encode(e.getValue(), "UTF-8"))
            .append("&");
      }

      url.deleteCharAt(url.length() - 1);
      return url.toString();

    } catch (Exception e) {
      throw new RuntimeException("buildSignedUrl error", e);
    }
  }

}



