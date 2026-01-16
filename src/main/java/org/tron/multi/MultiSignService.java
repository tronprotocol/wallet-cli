package org.tron.multi;

import static org.apache.commons.lang3.StringUtils.EMPTY;
import static org.tron.common.utils.ByteUtil.bytesToIntegerList;
import static org.tron.common.utils.TransactionUtils.getTransactionId;
import static org.tron.common.utils.Utils.TRANSFER_METHOD_ID;
import static org.tron.common.utils.Utils.greenBoldHighlight;
import static org.tron.common.utils.Utils.intToBooleanString;
import static org.tron.common.utils.Utils.parseAmountToLongStr;
import static org.tron.common.utils.Utils.redBoldHighlight;
import static org.tron.common.utils.Utils.yellowBoldHighlight;
import static org.tron.core.manager.UpdateAccountPermissionInteractive.operationsMap;
import static org.tron.trident.core.ApiWrapper.parseAddress;
import static org.tron.trident.proto.Chain.Transaction.Contract.ContractType.AccountPermissionUpdateContract;
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
import static org.tron.walletserver.WalletApi.encode58Check;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.google.common.collect.Sets;
import com.google.gson.JsonObject;
import com.google.protobuf.Any;
import com.google.protobuf.ByteString;
import com.google.protobuf.InvalidProtocolBufferException;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Scanner;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.lang3.tuple.Pair;
import org.bouncycastle.util.encoders.Hex;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.HttpUtils;
import org.tron.core.exception.CancelException;
import org.tron.core.exception.CipherException;
import org.tron.protos.Protocol;
import org.tron.trident.proto.Chain;
import org.tron.trident.proto.Chain.Transaction.Contract.ContractType;
import org.tron.trident.proto.Common;
import org.tron.trident.proto.Contract;
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
      WithdrawBalanceContract,
      AccountPermissionUpdateContract
  );
  private static final DateTimeFormatter FORMATTER =
      DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

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
    if (StringUtils.isEmpty(key)) {
      throw new IllegalArgumentException("Please check the secretId, secretKey and channel in config.conf.");
    }
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

    String baseUrl = config.getBaseUrl();
    if (StringUtils.isEmpty(baseUrl)) {
      throw new IllegalArgumentException(redBoldHighlight("Unsupported network"));
    }
    StringBuilder url = new StringBuilder(baseUrl).append(path).append("?");

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
    PENDING(0, 0),
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

  public String submitMultiSignTx(String address, JSONObject transaction)
      throws IOException {

    Map<String, String> params = new HashMap<>();
    params.put("sign_version", "v1");
    params.put("channel", config.getChannel());
    params.put("secret_id", config.getSecretId());
    params.put("ts", ts());
    params.put("uuid", uuid());
    params.put("address", address);

    params.put("sign", sign("POST", "/openapi/multi/transaction", params));

    String url = config.getBaseUrl()
        + "/openapi/multi/transaction?"
        + buildQuery(params);

    JSONObject body = new JSONObject();
    body.put("address", address);
    body.put("transaction", transaction);

    return HttpUtils.postJson(url, body.toJSONString());
  }

  private void showTransactionMenu(Scanner scanner, String address, WalletApi wallet) {
    ListType currentType = ListType.ALL;
    Integer isSign = null;
    int pageSize = 20;
    int currentPage = 0;
    while (true) {
      Pair<List<MultiTxSummaryParser.MultiTxSummary>, Integer> pair =
          fetchTransactions(address, currentType, isSign, currentPage * pageSize, pageSize);
      List<MultiTxSummaryParser.MultiTxSummary> txList = pair.getLeft();
      MultiTxSummaryParser.printTable(txList);
      printPageInfo(pageSize, currentPage, pair);
      System.out.println("\nTip: input " + greenBoldHighlight("p/P") + " for previous page, " + greenBoldHighlight("n/N") + " for next page");
      System.out.println("\nFilter options:");
      System.out.println("1. All transactions");
      System.out.println("2. Pending transactions");
      System.out.println("3. Signed(To Be Executed) transactions");
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
          currentType = ListType.PENDING;
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

  private static void printPageInfo(int pageSize, int currentPage, Pair<List<MultiTxSummaryParser.MultiTxSummary>, Integer> pair) {
    int total = pair.getRight();
    int totalPages = (total + pageSize - 1) / pageSize;
    int currentPageNo = currentPage + 1;

    System.out.printf(
        "%nPage %d / %d , Total Records: %d%n",
        currentPageNo,
        totalPages == 0 ? 1 : totalPages,
        total
    );
  }

  public Pair<List<MultiTxSummaryParser.MultiTxSummary>, Integer> fetchTransactions(String address, ListType type, Integer isSign, int start,
                                                                                     int limit) {
    try {
      String resp = list(address, type, isSign, start, limit);
      return MultiTxSummaryParser.parse(resp);
    } catch (Exception e) {
      System.out.println(yellowBoldHighlight("\nFailed to fetch transactions from tronlink multi-sign server: " + e.getMessage()));
      return Pair.of(Collections.emptyList(), 0);
    }
  }

  public static void printSignatureProgress(JSONArray signatureProgress) {

    String headerFormat = "%-36s  %-10s  %-20s%n";
    String rowFormat    = "%-36s  %-10s  %-20s%n";

    System.out.printf(headerFormat, "Address", "Weight", "Signed At");
    System.out.println("--------------------------------------------------------------------------");

    for (int i = 0; i < signatureProgress.size(); i++) {
      JSONObject obj = signatureProgress.getJSONObject(i);

      String address = obj.getString("address");
      int weight = obj.getIntValue("weight");
      int isSign = obj.getIntValue("is_sign");
      long signTime = obj.getLongValue("sign_time");

      String weightWithSign = formatWeightWithSign(weight, isSign);
      String formattedTime = formatSignTime(signTime);

      System.out.printf(rowFormat, address, weightWithSign, formattedTime);
    }
  }

  private static String formatWeightWithSign(int weight, int isSign) {
    return weight + (isSign == 1 ? " ✓" : "  ");
  }

  private static String formatSignTime(long signTime) {
    if (signTime <= 0) {
      return "-";
    }
    return LocalDateTime.ofInstant(
        Instant.ofEpochSecond(signTime),
        ZoneId.systemDefault()
    ).format(FORMATTER);
  }

  private void showTransactionDetail(String address, Scanner scanner, MultiTxSummaryParser.MultiTxSummary tx, WalletApi wallet) {
    System.out.println("\n--- Transaction Detail ---");
    System.out.println("Tx Id: " + tx.getHash());
    System.out.println("State: " + MultiSignService.ListType.from(tx.getState(), tx.getIsSign()).name().toLowerCase());
    printTransactionInfo(tx);
    System.out.println("Sign Progress: " + tx.getSignProgress());
    printSignatureProgress(tx.getSignatureProgress());
    System.out.println("\nCreate Time: " + MultiTxSummaryParser.formatTimestamp(tx.getTimestamp()));
    System.out.println("\nActions:");
    if (tx.getState() == 0 && tx.getIsSign() == 0) {
      System.out.println("1. Sign transaction");
    }
    System.out.println("0. Back");
    System.out.print(NUMBER_TO_OPERATE);
    String choice = scanner.nextLine().trim();
    switch (choice) {
      case "1":
        doSignTransaction(address, tx, wallet);
        break;
      case "0":
        return;
      default:
        System.out.println("Invalid input");
        break;
    }
  }

  private static void printTransactionInfo(MultiTxSummaryParser.MultiTxSummary tx) {
    Protocol.Transaction.raw raw = getRawBuilder(tx.getCurrentTransaction()).build();
    Protocol.Transaction.Contract contract = raw.getContract(0);
    Protocol.Transaction.Contract.ContractType contractType = contract.getType();
    System.out.println("Contract Type: " + tx.getContractType());
    System.out.println("Originator Address: " + tx.getOriginatorAddress());
    Any contractParameter = contract.getParameter();
    try {
      String ownerAddressStr = "Owner Address: ";
      String receiverAddressStr = "Receiver Address: ";
      String resourceStr = "Resource: ";
      switch (contractType) {
        case TransferContract:
          Contract.TransferContract transferContract =
              contractParameter.unpack(Contract.TransferContract.class);
          System.out.println(ownerAddressStr + encode58Check(transferContract.getOwnerAddress().toByteArray()));
          System.out.println("To Address: " + encode58Check(transferContract.getToAddress().toByteArray()));
          System.out.println("Amount: " + transferContract.getAmount());
          break;
        case TriggerSmartContract:
          Contract.TriggerSmartContract triggerSmartContract =
              contractParameter.unpack(Contract.TriggerSmartContract.class);
          System.out.println(ownerAddressStr + encode58Check(triggerSmartContract.getOwnerAddress().toByteArray()));
          System.out.println("Contract Address: " + encode58Check(triggerSmartContract.getContractAddress().toByteArray()));
          Pair<String, String> transferUsdtParams = getTransferUsdtParams(triggerSmartContract);
          System.out.println(receiverAddressStr + transferUsdtParams.getLeft());
          System.out.println("Amount: " + transferUsdtParams.getRight());
          System.out.println("Token: USDT");
          break;
        case FreezeBalanceV2Contract:
          Contract.FreezeBalanceV2Contract freezeBalanceV2Contract =
              contractParameter.unpack(Contract.FreezeBalanceV2Contract.class);
          System.out.println(ownerAddressStr + encode58Check(freezeBalanceV2Contract.getOwnerAddress().toByteArray()));
          System.out.println("Frozen Balance: " + freezeBalanceV2Contract.getFrozenBalance());
          System.out.println(resourceStr + freezeBalanceV2Contract.getResource().name());
          break;
        case UnfreezeBalanceV2Contract:
          Contract.UnfreezeBalanceV2Contract unfreezeBalanceV2Contract =
              contractParameter.unpack(Contract.UnfreezeBalanceV2Contract.class);
          System.out.println(ownerAddressStr + encode58Check(unfreezeBalanceV2Contract.getOwnerAddress().toByteArray()));
          System.out.println("UnFreeze Balance: " + unfreezeBalanceV2Contract.getUnfreezeBalance());
          System.out.println(resourceStr + unfreezeBalanceV2Contract.getResource().name());
          break;
        case CancelAllUnfreezeV2Contract:
          Contract.CancelAllUnfreezeV2Contract cancelAllUnfreezeV2Contract =
              contractParameter.unpack(Contract.CancelAllUnfreezeV2Contract.class);
          System.out.println(ownerAddressStr + encode58Check(cancelAllUnfreezeV2Contract.getOwnerAddress().toByteArray()));
          break;
        case WithdrawExpireUnfreezeContract:
          Contract.WithdrawExpireUnfreezeContract withdrawExpireUnfreezeContract =
              contractParameter.unpack(Contract.WithdrawExpireUnfreezeContract.class);
          System.out.println(ownerAddressStr + encode58Check(withdrawExpireUnfreezeContract.getOwnerAddress().toByteArray()));
          break;
        case DelegateResourceContract:
          Contract.DelegateResourceContract delegateResourceContract =
              contractParameter.unpack(Contract.DelegateResourceContract.class);
          System.out.println(ownerAddressStr + encode58Check(delegateResourceContract.getOwnerAddress().toByteArray()));
          System.out.println(receiverAddressStr + encode58Check(delegateResourceContract.getReceiverAddress().toByteArray()));
          System.out.println(resourceStr + delegateResourceContract.getResource().name());
          System.out.println("Delegate Balance: " + delegateResourceContract.getBalance());
          System.out.println("Lock: " + delegateResourceContract.getLock());
          System.out.println("Lock Period: " + delegateResourceContract.getLockPeriod());
          break;
        case UnDelegateResourceContract:
          Contract.UnDelegateResourceContract unDelegateResourceContract =
              contractParameter.unpack(Contract.UnDelegateResourceContract.class);
          System.out.println(ownerAddressStr + encode58Check(unDelegateResourceContract.getOwnerAddress().toByteArray()));
          System.out.println(receiverAddressStr + encode58Check(unDelegateResourceContract.getReceiverAddress().toByteArray()));
          System.out.println(resourceStr + unDelegateResourceContract.getResource().name());
          System.out.println("UnDelegate Balance: " + unDelegateResourceContract.getBalance());
          break;
        case VoteWitnessContract:
          Contract.VoteWitnessContract voteWitnessContract =
              contractParameter.unpack(Contract.VoteWitnessContract.class);
          System.out.println(ownerAddressStr + encode58Check(voteWitnessContract.getOwnerAddress().toByteArray()));
          System.out.println("Vote Info:");
          voteWitnessContract.getVotesList().forEach(vote -> {
            System.out.println("  Address: " + encode58Check(vote.getVoteAddress().toByteArray()));
            System.out.println("  Count: " + vote.getVoteCount());
          });
          break;
        case WithdrawBalanceContract:
          Contract.WithdrawBalanceContract withdrawBalanceContract =
              contractParameter.unpack(Contract.WithdrawBalanceContract.class);
          System.out.println(ownerAddressStr + encode58Check(withdrawBalanceContract.getOwnerAddress().toByteArray()));
          break;
        case AccountPermissionUpdateContract:
          Contract.AccountPermissionUpdateContract accountPermissionUpdateContract =
              contractParameter.unpack(Contract.AccountPermissionUpdateContract.class);
          System.out.println(ownerAddressStr + encode58Check(accountPermissionUpdateContract.getOwnerAddress().toByteArray()));
          printAccountPermissionUpdate(accountPermissionUpdateContract);
          break;
        default:
      }
    } catch (InvalidProtocolBufferException e) {
      System.out.println("InvalidProtocolBufferException" + e);
    }
    String note = raw.getData().toString(StandardCharsets.UTF_8);
    if (StringUtils.isNotEmpty(note)) {
      System.out.println("Note: " + note);
    }
  }

  public static void printAccountPermissionUpdate(Contract.AccountPermissionUpdateContract apu) {
    System.out.println();
    System.out.println("Owner Permission:");
    printPermission(apu.getOwner(), "  ");
    System.out.println();

    System.out.println("Active Permissions:");
    System.out.println("--------------------------------------------------");

    apu.getActivesList().forEach(p -> {
      System.out.println("[id=" + p.getId() + "] " + p.getPermissionName());
      printPermission(p, "  ");
      System.out.println();
    });
  }

  public static void printPermission(Common.Permission p, String indent) {
    System.out.println(indent + "name      : " + p.getPermissionName());
    if (!p.getOperations().isEmpty()) {
      System.out.println(indent + "operations: "
          + String.join(", ", parseOperations(p.getOperations())));
    }
    System.out.println(indent + "threshold : " + p.getThreshold());
    System.out.println(indent + "keys:");
    for (Common.Key k : p.getKeysList()) {
      System.out.println(indent + "  - "
          + encode58Check(k.getAddress().toByteArray())
          + " (weight=" + k.getWeight() + ")");
    }
  }

  public static List<String> parseOperations(ByteString operations) {
    List<Integer> ops = bytesToIntegerList(operations.toByteArray());
    return ops.stream()
        .map(code -> operationsMap.get(String.valueOf(code)))
        .filter(Objects::nonNull)
        .collect(Collectors.toList());
  }

  private static Pair<String, String> getTransferUsdtParams(Contract.TriggerSmartContract triggerSmartContract) {
    try {
      byte[] data = triggerSmartContract.getData().toByteArray();
      byte[] methodId = Arrays.copyOfRange(data, 0, 4);
      if (TRANSFER_METHOD_ID.equals(Hex.toHexString(methodId))) {
        byte[] toBytes = Arrays.copyOfRange(data, 4, 36);
        byte[] addressBytes = Arrays.copyOfRange(toBytes, 12, 32);
        byte[] tronAddressBytes = new byte[21];
        tronAddressBytes[0] = 0x41;
        System.arraycopy(addressBytes, 0, tronAddressBytes, 1, 20);
        String to = encode58Check(tronAddressBytes);
        byte[] amountBytes = Arrays.copyOfRange(data, 36, 68);
        return Pair.of(to, parseAmountToLongStr(amountBytes));
      }
    } catch (Exception e) {
      System.out.println(e.getMessage());
    }
    return Pair.of(EMPTY, EMPTY);
  }

  private void doSignTransaction(String address, MultiTxSummaryParser.MultiTxSummary tx, WalletApi wallet) {
    if (tx.getState() != 0) {
      return;
    }
    try {
      System.out.println("\nSigning transaction...");
      String resp = signTransaction(
          address,
          tx.getCurrentTransaction(),
          wallet
      );
      JSONObject root = JSON.parseObject(resp);
      if (root.getIntValue("code") != 0) {
        throw new RuntimeException(root.getString("original_message"));
      } else {
        System.out.println(greenBoldHighlight("Sign successful!"));
      }
    } catch (Exception e) {
      System.out.println(redBoldHighlight("Sign failed: " + e.getMessage()));
    }
  }


  public String signTransaction(String address, JSONObject currentTransaction, WalletApi wallet) throws IOException, CipherException, CancelException {

    Map<String, String> params = new HashMap<>();
    params.put("sign_version", "v1");
    params.put("channel", config.getChannel());
    params.put("secret_id", config.getSecretId());
    params.put("ts", ts());
    params.put("uuid", uuid());
    params.put("address", address);

    // real sign should be generated here
    params.put("sign", sign("POST", "/openapi/multi/transaction", params));
    String url = config.getBaseUrl()
        + "/openapi/multi/transaction?"
        + buildQuery(params);

    // ===== fastjson only =====
    JSONObject body = new JSONObject();
    body.put("address", address);

    // transaction is an object, not string
    Protocol.Transaction.raw.Builder raw = getRawBuilder(currentTransaction);

    JSONArray signatureArray = currentTransaction.getJSONArray("signature");
    String rawDataHex = Hex.toHexString(raw.build().toByteArray());
    Chain.Transaction.raw raw1 = Chain.Transaction.raw.parseFrom(raw.build().toByteArray());
    Chain.Transaction.Builder txBuilder = Chain.Transaction.newBuilder().setRawData(raw1);
    for (int i = 0; i < signatureArray.size(); i++) {
      String sig = signatureArray.getString(i);
      txBuilder.addSignature(ByteString.copyFrom(ByteArray.fromHexString(sig)));
    }
    Chain.Transaction transaction = wallet.signTransaction(txBuilder.build());
    List<String> signatureHexList = transaction.getSignatureList().stream()
        .map(ByteString::toByteArray)
        .map(Hex::toHexString)
        .collect(Collectors.toList());
    signatureArray.clear();
    signatureArray.addAll(signatureHexList);
    String txId = getTransactionId(rawDataHex).toString();
    currentTransaction.put("txID", txId);
    body.put("transaction", currentTransaction);

    return HttpUtils.postJson(url, body.toJSONString());
  }

  private static Protocol.Transaction.raw.Builder getRawBuilder(JSONObject currentTransaction) {
    JSONObject rawDataJO = currentTransaction.getJSONObject("raw_data");

    long expiration = rawDataJO.getLongValue("expiration");
    long timestamp = rawDataJO.getLongValue("timestamp");
    long feeLimit = rawDataJO.getLongValue("fee_limit");
    String refBlockBytes = rawDataJO.getString("ref_block_bytes");
    String refBlockHash = rawDataJO.getString("ref_block_hash");
    String dataJOString = rawDataJO.getString("data");
    JSONArray contracts = rawDataJO.getJSONArray("contract");
    JSONObject contract0 = contracts.getJSONObject(0);

    String type = contract0.getString("type");
    int permissionId = contract0.getIntValue("Permission_id");

    JSONObject value = contract0.getJSONObject("parameter").getJSONObject("value");

    Protocol.Transaction.raw.Builder raw = Protocol.Transaction.raw.newBuilder();
    Protocol.Transaction.Contract.Builder contract = buildContractByType(type, value);
    contract.setPermissionId(permissionId);
    raw.setExpiration(expiration);
    raw.setFeeLimit(feeLimit);
    raw.setTimestamp(timestamp);
    raw.setRefBlockBytes(ByteString.copyFrom(ByteArray.fromHexString(refBlockBytes)));
    raw.setRefBlockHash(ByteString.copyFrom(ByteArray.fromHexString(refBlockHash)));
    raw.setData(ByteString.copyFrom(ByteArray.fromHexString(dataJOString)));
    raw.addContract(contract.build());
    return raw;
  }

  private static Protocol.Transaction.Contract.Builder buildContractByType(
      String type, JSONObject value) {
    ByteString owner = null;
    String ownerAddress = "owner_address";
    if (StringUtils.isNotEmpty(value.getString(ownerAddress))) {
      owner = parseAddress(value.getString(ownerAddress));
    }
    ByteString to = null;
    String toAddress = "to_address";
    if (StringUtils.isNotEmpty(value.getString(toAddress))) {
      to = parseAddress(value.getString(toAddress));
    }
    ByteString receiver = null;
    String receiverAddress = "receiver_address";
    if (StringUtils.isNotEmpty(value.getString(receiverAddress))) {
      receiver = parseAddress(value.getString(receiverAddress));
    }
    ByteString contractAddress = null;
    String contractAddr = "contract_address";
    if (StringUtils.isNotEmpty(value.getString(contractAddr))) {
      contractAddress = parseAddress(value.getString(contractAddr));
    }
    int resource = value.getIntValue("resource");
    switch (type) {
      case "TransferContract":
        long amount = value.getLongValue("amount");
        if (owner == null || to == null) {
          throw new IllegalArgumentException(redBoldHighlight("owner address or to address is invalid"));
        }
        Contract.TransferContract contract =
            Contract.TransferContract.newBuilder()
                .setOwnerAddress(owner)
                .setToAddress(to)
                .setAmount(amount)
                .build();
        return Protocol.Transaction.Contract.newBuilder()
            .setType(Protocol.Transaction.Contract.ContractType.TransferContract)
            .setParameter(Any.pack(contract));
      case "TriggerSmartContract":
        String data = value.getString("data");
        long tokenId = value.getLongValue("token_id");
        long callTokenValue = value.getLongValue("call_token_value");
        long callValue = value.getLongValue("call_value");
        if (owner == null || contractAddress == null) {
          throw new IllegalArgumentException(redBoldHighlight("owner address or contract address is invalid"));
        }
        Contract.TriggerSmartContract triggerSmartContract = Contract.TriggerSmartContract
            .newBuilder().setData(ByteString.copyFrom(ByteArray.fromHexString(data)))
            .setTokenId(tokenId).setCallTokenValue(callTokenValue).setCallValue(callValue)
            .setContractAddress(contractAddress).setOwnerAddress(owner).build();
        return Protocol.Transaction.Contract.newBuilder()
            .setType(Protocol.Transaction.Contract.ContractType.TriggerSmartContract)
            .setParameter(Any.pack(triggerSmartContract));
      case "FreezeBalanceV2Contract":
        long frozenBalance = value.getLongValue("frozen_balance");
        if (owner == null) {
          throw new IllegalArgumentException(redBoldHighlight("owner address is invalid"));
        }
        Contract.FreezeBalanceV2Contract freezeBalanceV2Contract = Contract.FreezeBalanceV2Contract
            .newBuilder().setOwnerAddress(owner).setFrozenBalance(frozenBalance)
            .setResourceValue(resource).build();
        return Protocol.Transaction.Contract.newBuilder()
            .setType(Protocol.Transaction.Contract.ContractType.FreezeBalanceV2Contract)
            .setParameter(Any.pack(freezeBalanceV2Contract));
      case "UnfreezeBalanceV2Contract":
        long unfrozenBalance = value.getLongValue("unfreeze_balance");
        if (owner == null) {
          throw new IllegalArgumentException(redBoldHighlight("owner address is invalid"));
        }
        Contract.UnfreezeBalanceV2Contract unfreezeBalanceV2Contract = Contract.UnfreezeBalanceV2Contract
            .newBuilder().setOwnerAddress(owner).setUnfreezeBalance(unfrozenBalance)
            .setResourceValue(resource).build();
        return Protocol.Transaction.Contract.newBuilder()
            .setType(Protocol.Transaction.Contract.ContractType.UnfreezeBalanceV2Contract)
            .setParameter(Any.pack(unfreezeBalanceV2Contract));
      case "CancelAllUnfreezeV2Contract":
        if (owner == null) {
          throw new IllegalArgumentException(redBoldHighlight("owner address is invalid"));
        }
        Contract.CancelAllUnfreezeV2Contract cancelAllUnfreezeV2Contract = Contract.CancelAllUnfreezeV2Contract
            .newBuilder().setOwnerAddress(owner).build();
        return Protocol.Transaction.Contract.newBuilder()
            .setType(Protocol.Transaction.Contract.ContractType.CancelAllUnfreezeV2Contract)
            .setParameter(Any.pack(cancelAllUnfreezeV2Contract));
      case "WithdrawExpireUnfreezeContract":
        if (owner == null) {
          throw new IllegalArgumentException(redBoldHighlight("owner address is invalid"));
        }
        Contract.WithdrawExpireUnfreezeContract withdrawExpireUnfreezeContract = Contract.WithdrawExpireUnfreezeContract
            .newBuilder().setOwnerAddress(owner).build();
        return Protocol.Transaction.Contract.newBuilder()
            .setType(Protocol.Transaction.Contract.ContractType.WithdrawExpireUnfreezeContract)
            .setParameter(Any.pack(withdrawExpireUnfreezeContract));
      case "DelegateResourceContract":
        if (owner == null || receiver == null) {
          throw new IllegalArgumentException(redBoldHighlight("owner address or receiver address is invalid"));
        }
        long balance = value.getLongValue("balance");
        long lockPeriod = value.getLongValue("lock_period");
        boolean lock = value.getBooleanValue("lock");
        Contract.DelegateResourceContract delegateResourceContract = Contract.DelegateResourceContract
            .newBuilder().setOwnerAddress(owner).setReceiverAddress(receiver).setResourceValue(resource)
            .setBalance(balance).setLock(lock).setLockPeriod(lockPeriod).build();
        return Protocol.Transaction.Contract.newBuilder()
            .setType(Protocol.Transaction.Contract.ContractType.DelegateResourceContract)
            .setParameter(Any.pack(delegateResourceContract));
      case "UnDelegateResourceContract":
        if (owner == null || receiver == null) {
          throw new IllegalArgumentException(redBoldHighlight("owner address or receiver address is invalid"));
        }
        long unbalance = value.getLongValue("balance");
        Contract.UnDelegateResourceContract unDelegateResourceContract = Contract.UnDelegateResourceContract
            .newBuilder().setOwnerAddress(owner).setReceiverAddress(receiver).setResourceValue(resource)
            .setBalance(unbalance).build();
        return Protocol.Transaction.Contract.newBuilder()
            .setType(Protocol.Transaction.Contract.ContractType.UnDelegateResourceContract)
            .setParameter(Any.pack(unDelegateResourceContract));
      case "VoteWitnessContract":
        if (owner == null) {
          throw new IllegalArgumentException(redBoldHighlight("owner address is invalid"));
        }
        JSONArray votesJA = value.getJSONArray("votes");
        boolean support = value.getBooleanValue("support");
        Contract.VoteWitnessContract.Builder builder = Contract.VoteWitnessContract.newBuilder();
        builder.setOwnerAddress(owner);
        builder.setSupport(support);
        votesJA.forEach(o -> {
          JSONObject vote = (JSONObject) o;
          String voteAddress = vote.getString("vote_address");
          long voteCount = vote.getLongValue("vote_count");
          Contract.VoteWitnessContract.Vote.Builder voteBuilder = Contract.VoteWitnessContract.Vote.newBuilder();
          ByteString address = parseAddress(voteAddress);
          voteBuilder.setVoteAddress(address);
          voteBuilder.setVoteCount(voteCount);
          builder.addVotes(voteBuilder.build());
        });
        return Protocol.Transaction.Contract.newBuilder()
            .setType(Protocol.Transaction.Contract.ContractType.VoteWitnessContract)
            .setParameter(Any.pack(builder.build()));
      case "WithdrawBalanceContract":
        if (owner == null) {
          throw new IllegalArgumentException(redBoldHighlight("owner address is invalid"));
        }
        Contract.WithdrawBalanceContract withdrawBalanceContract = Contract.WithdrawBalanceContract
            .newBuilder().setOwnerAddress(owner).build();
        return Protocol.Transaction.Contract.newBuilder()
            .setType(Protocol.Transaction.Contract.ContractType.WithdrawBalanceContract)
            .setParameter(Any.pack(withdrawBalanceContract));
      case "AccountPermissionUpdateContract":
        if (owner == null) {
          throw new IllegalArgumentException(redBoldHighlight("owner address is invalid"));
        }
        Contract.AccountPermissionUpdateContract.Builder apuBuilder =
            Contract.AccountPermissionUpdateContract.newBuilder();
        // owner_address
        apuBuilder.setOwnerAddress(parseAddress(value.getString("owner_address")));
        // owner permission
        JSONObject ownerObj = value.getJSONObject("owner");
        Common.Permission ownerPermission = parsePermission(ownerObj, Common.Permission.PermissionType.Owner);
        if (Objects.nonNull(ownerPermission)) {
          apuBuilder.setOwner(ownerPermission);
        }
        // witness permission
        JSONObject witnessObj = value.getJSONObject("witness");
        Common.Permission witnessPermission = parsePermission(witnessObj, Common.Permission.PermissionType.Witness);
        if (Objects.nonNull(witnessPermission)) {
          apuBuilder.setWitness(witnessPermission);
        }
        // actives
        value.getJSONArray("actives").forEach(o -> {
          JSONObject activeObj = (JSONObject) o;
          apuBuilder.addActives(parsePermission(activeObj, Common.Permission.PermissionType.Active));
        });
        return Protocol.Transaction.Contract.newBuilder()
            .setType(Protocol.Transaction.Contract.ContractType.AccountPermissionUpdateContract)
            .setParameter(Any.pack(apuBuilder.build()));
      default:
        throw new UnsupportedOperationException("Unsupported contract type: " + type);
    }
  }

  public static Common.Permission parsePermission(JSONObject obj, Common.Permission.PermissionType type) {
    if (Objects.isNull(obj)) {
      return null;
    }
    Common.Permission.Builder permissionBuilder = Common.Permission.newBuilder();
    permissionBuilder.setType(type);
    permissionBuilder.setId(obj.getIntValue("id"));
    permissionBuilder.setPermissionName(obj.getString("permission_name"));
    permissionBuilder.setThreshold(obj.getLongValue("threshold"));

    if (obj.containsKey("operations")) {
      permissionBuilder.setOperations(
          ByteString.copyFrom(ByteArray.fromHexString(obj.getString("operations"))));
    }

    JSONArray keys = obj.getJSONArray("keys");
    for (int i = 0; i < keys.size(); i++) {
      JSONObject keyObj = keys.getJSONObject(i);

      Common.Key key = Common.Key.newBuilder()
          .setAddress(parseAddress(keyObj.getString("address")))
          .setWeight(keyObj.getLongValue("weight"))
          .build();

      permissionBuilder.addKeys(key);
    }

    return permissionBuilder.build();
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

}



