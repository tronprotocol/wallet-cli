package org.tron.walletserver;

import static org.apache.commons.lang3.StringUtils.EMPTY;
import static org.apache.commons.lang3.StringUtils.isEmpty;
import static org.tron.common.enums.NetType.CUSTOM;
import static org.tron.common.enums.NetType.MAIN;
import static org.tron.common.enums.NetType.NILE;
import static org.tron.common.enums.NetType.SHASTA;
import static org.tron.common.utils.Base58.encode;
import static org.tron.common.utils.Utils.LOCK_WARNING;
import static org.tron.common.utils.Utils.allNotBlank;
import static org.tron.common.utils.Utils.blueBoldHighlight;
import static org.tron.common.utils.Utils.failedHighlight;
import static org.tron.common.utils.Utils.formatLine;
import static org.tron.common.utils.Utils.getNode;
import static org.tron.common.utils.Utils.getTx;
import static org.tron.common.utils.Utils.greenBoldHighlight;
import static org.tron.common.utils.Utils.inputPassword;
import static org.tron.common.utils.Utils.redBoldHighlight;
import static org.tron.common.utils.Utils.yellowBoldHighlight;
import static org.tron.core.config.Parameter.CommonConstant.ADD_PRE_FIX_BYTE_MAINNET;
import static org.tron.core.config.Parameter.CommonConstant.ADD_PRE_FIX_BYTE_TESTNET;
import static org.tron.keystore.StringUtils.char2Byte;
import static org.tron.keystore.Wallet.decrypt2PrivateBytes;
import static org.tron.multi.MultiSignService.CONTRACT_TYPE_SET;
import static org.tron.trident.proto.Common.ResourceCode.TRON_POWER;
import static org.tron.walletcli.WalletApiWrapper.getLedgerPath;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.google.common.math.LongMath;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import com.google.protobuf.ByteString;
import com.google.protobuf.InvalidProtocolBufferException;
import com.typesafe.config.Config;
import com.typesafe.config.ConfigObject;
import java.io.File;
import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.math.BigInteger;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Paths;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Scanner;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.ArrayUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.lang3.tuple.Pair;
import org.apache.commons.lang3.tuple.Triple;
import org.bouncycastle.util.encoders.Hex;
import org.hid4java.HidDevice;
import org.jline.reader.LineReader;
import org.tron.api.GrpcAPI.TransactionSignWeight;
import org.tron.common.crypto.ECKey;
import org.tron.common.crypto.Hash;
import org.tron.common.crypto.Sha256Sm3Hash;
import org.tron.common.crypto.SignInterface;
import org.tron.common.crypto.SignatureInterface;
import org.tron.common.crypto.sm2.SM2;
import org.tron.common.enums.NetType;
import org.tron.common.utils.Base58;
import org.tron.common.utils.ByteArray;
import org.tron.common.utils.DecodeUtil;
import org.tron.common.utils.MultiTxWebSocketClient;
import org.tron.common.utils.TransactionUtils;
import org.tron.common.utils.Utils;
import org.tron.core.config.Configuration;
import org.tron.core.config.Parameter.CommonConstant;
import org.tron.core.dao.Tx;
import org.tron.core.exception.CancelException;
import org.tron.core.exception.CipherException;
import org.tron.core.manager.TxHistoryManager;
import org.tron.keystore.CheckStrength;
import org.tron.keystore.ClearWalletUtils;
import org.tron.keystore.Credentials;
import org.tron.keystore.Wallet;
import org.tron.keystore.WalletFile;
import org.tron.keystore.WalletUtils;
import org.tron.ledger.LedgerFileUtil;
import org.tron.ledger.LedgerSignUtil;
import org.tron.ledger.TronLedgerGetAddress;
import org.tron.ledger.listener.TransactionSignManager;
import org.tron.ledger.wrapper.HidServicesWrapper;
import org.tron.ledger.wrapper.LedgerSignResult;
import org.tron.mnemonic.Mnemonic;
import org.tron.mnemonic.MnemonicFile;
import org.tron.mnemonic.MnemonicUtils;
import org.tron.multi.AuthInfo;
import org.tron.multi.MultiConfig;
import org.tron.multi.MultiSignService;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.contract.AccountContract.AccountCreateContract;
import org.tron.protos.contract.AccountContract.AccountUpdateContract;
import org.tron.protos.contract.AccountContract.SetAccountIdContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.ParticipateAssetIssueContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.TransferAssetContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.UnfreezeAssetContract;
import org.tron.protos.contract.AssetIssueContractOuterClass.UpdateAssetContract;
import org.tron.protos.contract.BalanceContract;
import org.tron.protos.contract.BalanceContract.CancelAllUnfreezeV2Contract;
import org.tron.protos.contract.BalanceContract.TransferContract;
import org.tron.protos.contract.BalanceContract.UnfreezeBalanceContract;
import org.tron.protos.contract.BalanceContract.WithdrawBalanceContract;
import org.tron.protos.contract.ExchangeContract.ExchangeCreateContract;
import org.tron.protos.contract.ExchangeContract.ExchangeInjectContract;
import org.tron.protos.contract.ExchangeContract.ExchangeTransactionContract;
import org.tron.protos.contract.ExchangeContract.ExchangeWithdrawContract;
import org.tron.protos.contract.ProposalContract.ProposalApproveContract;
import org.tron.protos.contract.ProposalContract.ProposalCreateContract;
import org.tron.protos.contract.ProposalContract.ProposalDeleteContract;
import org.tron.protos.contract.SmartContractOuterClass.ClearABIContract;
import org.tron.protos.contract.SmartContractOuterClass.CreateSmartContract;
import org.tron.protos.contract.SmartContractOuterClass.SmartContract;
import org.tron.protos.contract.SmartContractOuterClass.TriggerSmartContract;
import org.tron.protos.contract.SmartContractOuterClass.UpdateEnergyLimitContract;
import org.tron.protos.contract.SmartContractOuterClass.UpdateSettingContract;
import org.tron.protos.contract.WitnessContract.VoteWitnessContract;
import org.tron.protos.contract.WitnessContract.WitnessCreateContract;
import org.tron.protos.contract.WitnessContract.WitnessUpdateContract;
import org.tron.trident.api.GrpcAPI;
import org.tron.trident.core.exceptions.IllegalException;
import org.tron.trident.proto.Chain;
import org.tron.trident.proto.Common;
import org.tron.trident.proto.Contract;
import org.tron.trident.proto.Response;

@Slf4j
public class WalletApi {
  public static final long TRX_PRECISION = 1000_000L;
  private static final String FilePath = "Wallet";
  private static final String MnemonicFilePath = "Mnemonic";
  private static final String CONFIGURATION_PATH = "config.conf";
  private List<WalletFile> walletFile = new ArrayList<>();
  private boolean loginState = false;
  private byte[] address;
  private static byte addressPreFixByte = ADD_PRE_FIX_BYTE_TESTNET;
  private static int rpcVersion = 0;
  private static boolean lockAccount;
  private static boolean isEckey = true;
  @Getter
  @Setter
  private boolean isLedgerUser = false;
  @Getter
  @Setter
  private String path;
  @Getter
  @Setter
  private Credentials credentials;
  @Getter
  @Setter
  private byte[] unifiedPassword;
  @Getter
  @Setter
  private byte[] pwdForDeploy;
  @Getter
  @Setter
  private List<WalletFile> walletList = new ArrayList<>();
  @Getter
  @Setter
  private static ApiClient apiCli = initApiCli();
  @Getter
  @Setter
  private static NetType currentNetwork;
  @Getter
  @Setter
  private static Pair<Pair<String, Boolean>, Pair<String, Boolean>> customNodes;
  private final MultiSignService multiSignService = initMultiSignService();

  private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);
  private ScheduledFuture<?> autoLockFuture;
  private MultiTxWebSocketClient wsClient;

  public static void updateRpcCli(ApiClient client) {
    apiCli.close();
    apiCli = client;
  }

  private MultiSignService initMultiSignService() {
    Triple<String, String, String> tronlinkPair = getTronlinkTriple(currentNetwork);
    MultiConfig multiConfig = new MultiConfig(
        currentNetwork.getTronlinkUrl(),
        tronlinkPair.getLeft(),
        tronlinkPair.getMiddle(),
        tronlinkPair.getRight()
    );
    return new MultiSignService(multiConfig);
  }

  public static Triple<String, String, String> getTronlinkTriple(NetType netType) {
    Config config = Configuration.getByPath(CONFIGURATION_PATH);
    String secretId = EMPTY;
    String secretKey = EMPTY;
    String channel = EMPTY;
    String secretIdPath = netType == MAIN ? "tronlink.mainnet.secretId" : "tronlink.testnet.secretId";
    String secretKeyPath = netType == MAIN ? "tronlink.mainnet.secretKey" : "tronlink.testnet.secretKey";
    String channelPath = netType == MAIN ? "tronlink.mainnet.channel" : "tronlink.testnet.channel";
    if (config.hasPath(secretIdPath)) {
      secretId = config.getString(secretIdPath);
    }
    if (config.hasPath(secretKeyPath)) {
      secretKey = config.getString(secretKeyPath);
    }
    if (config.hasPath(channelPath)) {
      channel = config.getString(channelPath);
    }
    return Triple.of(secretId, secretKey, channel);
  }

  public static ApiClient initApiCli() {
    Config config = Configuration.getByPath(CONFIGURATION_PATH);

    String fullNode = getNode(config, "fullnode.ip.list");
    String solidityNode = getNode(config, "soliditynode.ip.list");
    if (isEmpty(fullNode) && isEmpty(solidityNode)) {
      fullNode = MAIN.getGrpc().getFullNode();
      solidityNode = MAIN.getGrpc().getSolidityNode();
      System.out.println("Detected that both the " + greenBoldHighlight("fullnode.ip.list") + " and " + greenBoldHighlight("soliditynode.ip.list") + " configured in the config.conf are empty, and the default " + blueBoldHighlight("MAIN") + " network connection will be used.");
    }
    boolean isFullnodeEmpty = false;
    boolean isSoliditynodeEmpty = false;
    if (isEmpty(fullNode) && !isEmpty(solidityNode)) {
      fullNode = solidityNode;
      isFullnodeEmpty = true;
      System.out.println(yellowBoldHighlight("If only soliditynode.ip.list is configured, transactions and other operations will not be available."));
    } else if (!isEmpty(fullNode) && isEmpty(solidityNode)) {
      solidityNode = fullNode;
      isSoliditynodeEmpty = true;
    }
    if (config.hasPath("net.type") && "mainnet".equalsIgnoreCase(config.getString("net.type"))) {
      WalletApi.setAddressPreFixByte(ADD_PRE_FIX_BYTE_MAINNET);
    } else {
      WalletApi.setAddressPreFixByte(ADD_PRE_FIX_BYTE_TESTNET);
    }
    if (config.hasPath("crypto.engine")) {
      isEckey = config.getString("crypto.engine").equalsIgnoreCase("eckey");
      System.out.println("WalletApi getConfig isEckey: " + isEckey);
    }
    if (config.hasPath("lockAccount")) {
      lockAccount = config.getBoolean("lockAccount");
      System.out.println("WalletApi lockAccount : " + lockAccount);
    }
    if (StringUtils.isNotEmpty(fullNode) || StringUtils.isNotEmpty(solidityNode)) {
      if (fullNode.equals(NILE.getGrpc().getFullNode()) && solidityNode.equals(NILE.getGrpc().getSolidityNode())) {
        currentNetwork = NILE;
      } else if (fullNode.equals(SHASTA.getGrpc().getFullNode()) && solidityNode.equals(SHASTA.getGrpc().getSolidityNode())) {
        currentNetwork = SHASTA;
      } else if (fullNode.equals(MAIN.getGrpc().getFullNode()) && solidityNode.equals(MAIN.getGrpc().getSolidityNode())) {
        currentNetwork = MAIN;
      } else {
        currentNetwork = CUSTOM;
      }
    } else {
      System.out.println("The config.conf configuration is invalid. " + greenBoldHighlight("fullnode.ip.lit") + " and " + greenBoldHighlight("fullnode.ip.lit") + " cannot both be empty at the same time.");
    }
    WalletApi.setCustomNodes(Pair.of(Pair.of(fullNode, isFullnodeEmpty), Pair.of(solidityNode, isSoliditynodeEmpty)));
    return new ApiClient(fullNode, solidityNode, isFullnodeEmpty, isSoliditynodeEmpty);
  }

  public static String selectFullNode() {
    Map<String, String> witnessMap = new HashMap<>();
    Config config = Configuration.getByPath(CONFIGURATION_PATH);
    List list = config.getObjectList("witnesses.witnessList");
    for (Object o : list) {
      ConfigObject obj = (ConfigObject) o;
      String ip = obj.get("ip").unwrapped().toString();
      String url = obj.get("url").unwrapped().toString();
      witnessMap.put(url, ip);
    }

    Response.WitnessList witnesses = apiCli.listWitnesses();
    long minMissedNum = 100000000L;
    String minMissedWitness = "";
    if (witnesses != null) {
      List<Response.Witness> witnessList = witnesses.getWitnessesList();
      for (Response.Witness witness : witnessList) {
        String url = witness.getUrl();
        long missedBlocks = witness.getTotalMissed();
        if (missedBlocks < minMissedNum) {
          minMissedNum = missedBlocks;
          minMissedWitness = url;
        }
      }
    }
    return witnessMap.getOrDefault(minMissedWitness, "");
  }

  public static byte getAddressPreFixByte() {
    return addressPreFixByte;
  }

  public static void setAddressPreFixByte(byte addressPreFixByte) {
    WalletApi.addressPreFixByte = addressPreFixByte;
  }

  public static int getRpcVersion() {
    return rpcVersion;
  }

  /**
   * Creates a new WalletApi with a random ECKey or no ECKey.
   */
  public static WalletFile CreateWalletFile(byte[] password, int wordsNumber) throws CipherException, IOException {
    WalletFile walletFile = null;
    SecureRandom secureRandom = Utils.getRandom();
    try {
      List<String> mnemonicWords = MnemonicUtils.generateMnemonic(secureRandom, wordsNumber);
      byte[] priKey = MnemonicUtils.getPrivateKeyFromMnemonic(mnemonicWords);

      if (isEckey) {
        ECKey ecKey = new ECKey(priKey, true);
        walletFile = Wallet.createStandard(password, ecKey);
        storeMnemonicWords(password, ecKey, mnemonicWords);
      } else {
        SM2 sm2 = new SM2(priKey, true);
        walletFile = Wallet.createStandard(password, sm2);
        storeMnemonicWords(password, sm2, mnemonicWords);
      }
      Arrays.fill(priKey, (byte) 0);
      for (int i = 0; i < mnemonicWords.size(); i++) {
        mnemonicWords.set(i, null);
      }
    } catch (Exception e) {
      throw new IOException("Mnemonic generation failed", e);
    }

    return walletFile;
  }

  public static WalletFile CreateLedgerWalletFile(byte[] password, String address, String path)
      throws CipherException {
    return Wallet.createStandardLedger(password, address, path);
  }

  public static void storeMnemonicWords(byte[] password, SignInterface ecKeySm2Pair, List<String> mnemonicWords) throws CipherException, IOException {
    MnemonicFile mnemonicFile = Mnemonic.createStandard(password, ecKeySm2Pair, mnemonicWords);
    String keystoreName = MnemonicUtils.store2Keystore(mnemonicFile);
    System.out.println("mnemonic file : ."
        + File.separator + "Mnemonic" + File.separator
        + keystoreName);
  }

  //  Create Wallet with a pritKey
  public static WalletFile CreateWalletFile(byte[] password, byte[] priKey, List<String> mnemonicWords) throws CipherException, IOException {
    WalletFile walletFile = null;
    if (isEckey) {
      ECKey ecKey = ECKey.fromPrivate(priKey);
      walletFile = Wallet.createStandard(password, ecKey);
      if (mnemonicWords != null && !mnemonicWords.isEmpty()) {
        storeMnemonicWords(password, ecKey, mnemonicWords);
      }
    } else {
      SM2 sm2 = SM2.fromPrivate(priKey);
      walletFile = Wallet.createStandard(password, sm2);
      if (mnemonicWords != null && !mnemonicWords.isEmpty()) {
        storeMnemonicWords(password, sm2, mnemonicWords);
      }
    }
    return walletFile;
  }

  public boolean isLoginState() {
    return loginState;
  }

  public void logout() {
    loginState = false;
    walletFile.clear();
    this.walletFile = null;
    setLedgerUser(false);
    setCredentials(null);
    setUnifiedPassword(null);
  }

  public void setLogin(LineReader lineReader) {
    loginState = true;
    if (lineReader == null || !allNotBlank(getTronlinkTriple(currentNetwork))) {
      return;
    }
    startWebSocket(lineReader, encode58Check(address));
  }

  private void startWebSocket(LineReader lineReader, String address) {
    try {
      String baseUrl = currentNetwork.getTronlinkUrl();
      if (StringUtils.isEmpty(baseUrl)) {
        return;
      }
      URI baseUri = URI.create(baseUrl);
      String scheme = "https".equalsIgnoreCase(baseUri.getScheme()) ? "wss" : "ws";
      URI uri = new URI(
          scheme,
          baseUri.getUserInfo(),
          baseUri.getHost(),
          baseUri.getPort(),
          "/openapi/multi/socket",
          null,
          null
      );
      Map<String, String> headers = new HashMap<>();
      headers.put("address", address);
      headers.put("sign", multiSignService.signWebsocket(uri.getPath(), headers));
      wsClient = new MultiTxWebSocketClient(uri, headers, lineReader, address);

      wsClient.setConnectionLostTimeout(60);
      wsClient.connect();

    } catch (Exception e) {
      lineReader.printAbove("❌ WS init failed: " + e.getMessage());
    }
  }

  public boolean checkPassword(byte[] passwd) throws CipherException {
    return Wallet.validPassword(passwd, this.walletFile.get(0));
  }

  /**
   * Creates a Wallet with an existing ECKey.
   */
  public WalletApi(WalletFile walletFile) {
    if (this.walletFile.isEmpty()) {
      this.walletFile.add(walletFile);
    } else {
      this.walletFile.set(0, walletFile);
    }
    this.address = decodeFromBase58Check(walletFile.getAddress());
  }

  public WalletFile getWalletFile() {
    return walletFile.get(0);
  }

  public ECKey getEcKey(WalletFile walletFile, byte[] password) throws CipherException {
    return Wallet.decrypt(password, walletFile);
  }

  public SM2 getSM2(WalletFile walletFile, byte[] password) throws CipherException {
    return Wallet.decryptSM2(password, walletFile);
  }

  public byte[] getPrivateBytes(byte[] password) throws CipherException, IOException {
    return decrypt2PrivateBytes(password, loadWalletFile());
  }

  public Pair<byte[], WalletFile> getPair(byte[] password) throws CipherException, IOException {
    WalletFile wf = loadWalletFile();
    byte[] bytes = decrypt2PrivateBytes(password, wf);
    return Pair.of(bytes, wf);
  }

  public String exportKeystore(String walletChannel, File exportFullDir) throws IOException {
    String ret;
    try {
      WalletFile wf = getWalletFile();
      String walletAddress = wf.getAddress();
      String walletHexAddress = getHexAddress(wf.getAddress());
      String originalAddress = wf.getAddress();
      wf.setAddress(walletHexAddress);
      try {
        ret = WalletUtils.exportWalletFile(wf, walletAddress, exportFullDir);
      } finally {
        wf.setAddress(originalAddress);
      }
    } catch (Exception e) {
      System.out.println("exportKeystore " + failedHighlight() + ". " + e.getMessage());
      return null;
    }
    return ret;
  }

  public byte[] getAddress() {
    return address;
  }

  public static String store2Keystore(WalletFile walletFile) throws IOException {
    if (walletFile == null) {
      System.out.println("Warning: Store wallet " + failedHighlight() + ", walletFile is null !!");
      return null;
    }
    if (WalletUtils.hasStoreFile(walletFile.getAddress(), FilePath)) {
      WalletUtils.deleteStoreFile(walletFile.getAddress(), FilePath);
    }
    File file = new File(FilePath);
    if (!file.exists()) {
      if (!file.mkdir()) {
        throw new IOException("Make directory failed!");
      }
    } else {
      if (!file.isDirectory()) {
        if (file.delete()) {
          if (!file.mkdir()) {
            throw new IOException("Make directory failed!");
          }
        } else {
          throw new IOException("File exists and can not be deleted!");
        }
      }
    }
    return WalletUtils.generateWalletFile(walletFile, file);
  }

  public static String store2KeystoreLedger(WalletFile walletFile) throws IOException {
    if (walletFile == null) {
      System.out.println("Warning: Store wallet " + failedHighlight() + ", walletFile is null !!");
      return null;
    }
    File file = new File(FilePath);
    if (!file.exists()) {
      if (!file.mkdir()) {
        throw new IOException("Make directory failed!");
      }
    } else {
      if (!file.isDirectory()) {
        if (file.delete()) {
          if (!file.mkdir()) {
            throw new IOException("Make directory failed!");
          }
        } else {
          throw new IOException("File exists and can not be deleted!");
        }
      }
    }
    return WalletUtils.generateLegerWalletFile(walletFile, file);
  }

  private static void listWallets(File[] wallets) throws IOException {
    String headerFormat = "%-4s %-42s %-76s";
    System.out.println("\n" + greenBoldHighlight(String.format(headerFormat, "No.", "Address", "Name")));

    for (int i = 0; i < wallets.length; i++) {
      File f = wallets[i];
      WalletFile wf = WalletUtils.loadWalletFile(f);
      String walletName = StringUtils.isEmpty(wf.getName()) ? f.getName() : wf.getName();
      System.out.println(formatLine(
          String.valueOf(i + 1),
          wf.getAddress(),
          walletName,
          4, 42, 76));
    }
  }

  private static void searchWallets(File[] wallets, String searchTerm) throws IOException {
    String headerFormat = "%-4s %-42s %-76s";
    boolean found = false;

    System.out.println(greenBoldHighlight(String.format(headerFormat, "No.", "Address", "Name")));

    for (int i = 0; i < wallets.length; i++) {
      File f = wallets[i];
      WalletFile wf = WalletUtils.loadWalletFile(f);

      if (f.getName().toLowerCase().contains(searchTerm.toLowerCase())
          || (StringUtils.isNotEmpty(wf.getName()) && wf.getName().toLowerCase().contains(searchTerm.toLowerCase()))
          || wf.getAddress().toLowerCase().contains(searchTerm.toLowerCase())) {

        printWalletInfo(wallets, i);
        found = true;
      }
    }

    if (!found) {
      System.out.println("No wallets found matching: " + searchTerm);
    }
  }

  private static void printWalletInfo(File[] wallets, int index)
      throws IOException {
    File f = wallets[index];
    WalletFile wf = WalletUtils.loadWalletFile(f);
    String walletName = StringUtils.isEmpty(wf.getName()) ? f.getName() : wf.getName();
    System.out.println(formatLine(
        String.valueOf(index + 1),
        wf.getAddress(),
        walletName,
        4, 42, 76));
  }

  public static File selcetWalletFile() throws IOException {
    File file = new File(FilePath);
    if (!file.exists() || !file.isDirectory()) {
      return null;
    }

    File[] wallets = file.listFiles();
    if (ArrayUtils.isEmpty(wallets)) {
      return null;
    }

    File wallet;
    if (wallets.length > 1) {
      listWallets(wallets);
      Scanner scanner = new Scanner(System.in);
      System.out.println("Please choose No. between " + greenBoldHighlight(1) +
          " and " + greenBoldHighlight(wallets.length) + ", or enter " + greenBoldHighlight("search") + " to search wallets");
      while (true) {
        String input = scanner.nextLine().trim();
        if ("search".equalsIgnoreCase(input)) {
          System.out.println("Enter search term (Name or Address), or '" +
              greenBoldHighlight("Enter") + "' to end search");
          while (true) {
            String searchInput = scanner.nextLine().trim();
            if (searchInput.isEmpty()) {
              break;
            }
            searchWallets(wallets, searchInput);
            System.out.println("\nEnter another search term or '" +
                greenBoldHighlight("Enter") + "' to end search");
          }
          System.out.println("Please choose No. between " + greenBoldHighlight(1) +
              " and " + greenBoldHighlight(wallets.length));
          continue;
        }
        String num = input.split("\\s+")[0];
        int n;
        try {
          n = Integer.parseInt(num);
        } catch (NumberFormatException e) {
          System.out.println("Invalid number of " + num);
          System.out.println("Please choose No. again between 1 and " + wallets.length);
          continue;
        }
        if (n < 1 || n > wallets.length) {
          System.out.println("Please choose No. again between 1 and " + wallets.length);
          continue;
        }
        wallet = wallets[n - 1];
        break;
      }
    } else {
      wallet = wallets[0];
      System.out.println("The keystore file " + blueBoldHighlight(wallet.getName()) + " is loaded.");
    }

    return wallet;
  }

  public static File[] getAllWalletFile() {
    File file = new File(FilePath);
    if (!file.exists() || !file.isDirectory()) {
      return new File[0];
    }

    File[] wallets = file.listFiles();
    if (ArrayUtils.isEmpty(wallets)) {
      return new File[0];
    }
    return wallets;
  }

  public static File selcetMnemonicFile() {
    File file = new File(MnemonicFilePath);
    if (!file.exists() || !file.isDirectory()) {
      return null;
    }

    File[] mnemonicFiles = file.listFiles();
    if (ArrayUtils.isEmpty(mnemonicFiles)) {
      return null;
    }

    File mnemonicFile;
    if (mnemonicFiles.length > 1) {
      for (int i = 0; i < mnemonicFiles.length; i++) {
        System.out.println("The " + (i + 1) + "th mnemonic file name is " + mnemonicFiles[i].getName());
      }
      System.out.println("Please choose between " + greenBoldHighlight(1) + " and " + greenBoldHighlight(mnemonicFiles.length));
      Scanner in = new Scanner(System.in);
      while (true) {
        String input = in.nextLine().trim();
        String num = input.split("\\s+")[0];
        int n;
        try {
          n = Integer.parseInt(num);
        } catch (NumberFormatException e) {
          System.out.println("Invalid number of " + num);
          System.out.println("Please choose again between 1 and " + mnemonicFiles.length);
          continue;
        }
        if (n < 1 || n > mnemonicFiles.length) {
          System.out.println("Please choose again between 1 and " + mnemonicFiles.length);
          continue;
        }
        mnemonicFile = mnemonicFiles[n - 1];
        break;
      }
    } else {
      mnemonicFile = mnemonicFiles[0];
    }

    return mnemonicFile;
  }

  public WalletFile selectWalletFileE() throws IOException {
    File file = selcetWalletFile();
    if (file == null) {
      throw new IOException(
          "No keystore file found, please use " + greenBoldHighlight("RegisterWallet") + " or " + greenBoldHighlight("ImportWallet") + " first!");
    }
    String fileName = file.getName();
    for (WalletFile wf : this.walletFile) {
      String walletAddress = wf.getAddress();
      if (fileName.contains(walletAddress)) {
        if (StringUtils.isEmpty(wf.getName())) {
          wf.setName(fileName);
        }
        return wf;
      }
    }

    WalletFile wallet = WalletUtils.loadWalletFile(file);
    this.walletFile.add(wallet);
    if (StringUtils.isEmpty(wallet.getName())) {
      wallet.setName(fileName);
    }
    return wallet;
  }

  public static boolean changeKeystorePassword(byte[] oldPassword, byte[] newPassowrd)
      throws IOException, CipherException {
    File wallet = selcetWalletFile();
    if (wallet == null) {
      throw new IOException(
          "No keystore file found, please use " + greenBoldHighlight("RegisterWallet") + " or " + greenBoldHighlight("ImportWallet") + " first!");
    }
    Credentials credentials = WalletUtils.loadCredentials(oldPassword, wallet);
    WalletUtils.updateWalletFile(newPassowrd, credentials.getPair(), wallet, true);

    // update the password of mnemonicFile
    String ownerAddress = credentials.getAddress();
    File mnemonicFile = Paths.get("Mnemonic", ownerAddress + ".json").toFile();
    if (mnemonicFile.exists()) {
      try {
        byte[] mnemonicBytes = MnemonicUtils.getMnemonicBytes(oldPassword, mnemonicFile);
        List<String> words = MnemonicUtils.stringToMnemonicWords(new String(mnemonicBytes));
        MnemonicUtils.updateMnemonicFile(newPassowrd, credentials.getPair(), mnemonicFile, true, words);
      } catch (Exception e) {
        System.out.println("update mnemonic file " + failedHighlight() + ", please check the mnemonic file");
      }
    }
    return true;
  }

  private static WalletFile loadWalletFile() throws IOException {
    File wallet = selcetWalletFile();
    if (wallet == null) {
      throw new IOException(
          "No keystore file found, please use " + greenBoldHighlight("RegisterWallet") + " or " + greenBoldHighlight("ImportWallet") + " first!");
    }
    WalletFile wf = WalletUtils.loadWalletFile(wallet);
    wf.setSourceFile(wallet);
    if (StringUtils.isEmpty(wf.getName())) {
      wf.setName(wallet.getName());
    }
    return wf;
  }

  /**
   * load a Wallet from keystore
   */
  public static WalletApi loadWalletFromKeystore() throws IOException {
    WalletFile walletFile = loadWalletFile();
    return new WalletApi(walletFile);
  }

  public Response.Account queryAccount() {
    return queryAccount(getAddress());
  }

  public static Response.Account queryAccount(byte[] address) {
    return apiCli.queryAccount(address); // call rpc
  }

  public static Response.Account queryAccountById(String accountId) {
    return apiCli.queryAccountById(accountId);
  }

  private boolean confirm() {
    Scanner in = new Scanner(System.in);
    while (true) {
      String input = in.nextLine().trim();
      String str = input.split("\\s+")[0];
      if ("y".equalsIgnoreCase(str)) {
        return true;
      } else {
        return false;
      }
    }
  }

  public boolean isUnifiedExist() {
    return isLoginState() && ArrayUtils.isNotEmpty(getUnifiedPassword());
  }

  public String signTransaction(byte[] hash) throws IOException, CipherException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    System.out.println("Please choose your key for sign.");
    WalletFile wf = selectWalletFileE();
    boolean isLedgerFile = wf.getName().contains("Ledger");
    byte[] passwd;
    if (lockAccount && isUnifiedExist() && Arrays.equals(decodeFromBase58Check(wf.getAddress()), getAddress())) {
      passwd = getUnifiedPassword();
    } else {
      System.out.println("Please input your password.");
      passwd = char2Byte(inputPassword(false));
    }
    String ledgerPath = getLedgerPath(passwd, wf);
    if (isLedgerFile) {
      Chain.Transaction transaction = Chain.Transaction.newBuilder().setRawData(Chain.Transaction.raw.newBuilder().setData(ByteString.copyFrom(hash))).build();
      boolean ledgerResult = LedgerSignUtil.requestLedgerSignLogic(transaction, ledgerPath, wf.getAddress(), true);
      String signature = null;
      if (ledgerResult) {
        signature = TransactionSignManager.getInstance().getGasfreeSignature();
      }
      if (Objects.isNull(signature)) {
        TransactionSignManager.getInstance().setTransaction(null);
        TransactionSignManager.getInstance().setGasfreeSignature(null);
        throw new IllegalArgumentException("Listening ledger did not obtain signature.");
      }
      TransactionSignManager.getInstance().setTransaction(null);
      TransactionSignManager.getInstance().setGasfreeSignature(null);
      return signature;
    } else {
      SignatureInterface signature;
      if (isEckey) {
        signature = this.getEcKey(wf, passwd).sign(hash);
      } else {
        signature = this.getSM2(wf, passwd).sign(hash);
      }
      return Hex.toHexString(signature.toByteArray());
    }
  }

  private Chain.Transaction signTransaction(Chain.Transaction transaction, boolean multi)
      throws CipherException, IOException, CancelException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (transaction.getRawData().getTimestamp() == 0) {
      transaction = TransactionUtils.setTimestamp(transaction);
    }
    transaction = TransactionUtils.setExpirationTime(transaction, multi);

    String tipsString = "Please confirm and input your " + greenBoldHighlight("permission id")
        + ", if input " + greenBoldHighlight("y/Y") + " means "
        + "default 0, other non-numeric characters will cancel transaction.";
    transaction = TransactionUtils.setPermissionId(transaction, tipsString);
    while (true) {
      System.out.println("Please choose your key for sign.");
      WalletFile wf = selectWalletFileE();
      boolean isLedgerFile = wf.getName().contains("Ledger");
      byte[] passwd;
      if (lockAccount && isUnifiedExist() && Arrays.equals(decodeFromBase58Check(wf.getAddress()), getAddress())) {
        passwd = getUnifiedPassword();
      } else {
        System.out.println("Please input your password.");
        passwd = char2Byte(inputPassword(false));
      }
      String ledgerPath = getLedgerPath(passwd, wf);
      if (isLedgerFile) {
        boolean result = LedgerSignUtil.requestLedgerSignLogic(transaction, ledgerPath, wf.getAddress(), false);
        if (result) {
          transaction = TransactionSignManager.getInstance().getTransaction();
          Response.TransactionSignWeight weight = getTransactionSignWeight(transaction);
          if (weight.getResult().getCode() == Response.TransactionSignWeight.Result.response_code.ENOUGH_PERMISSION) {
            TransactionSignManager.getInstance().setTransaction(null);
            return transaction;
          }
          HidDevice hidDevice = HidServicesWrapper.getInstance().getHidDevice(wf.getAddress(), getPath());
          if (hidDevice == null) {
            TransactionSignManager.getInstance().setTransaction(null);
            return null;
          }
          Optional<String> state = LedgerSignResult.getLastTransactionState(hidDevice.getPath());
          boolean confirmed = state.isPresent() && LedgerSignResult.SIGN_RESULT_SUCCESS.equals(state.get());
          if (weight.getResult().getCode() == Response.TransactionSignWeight.Result.response_code.NOT_ENOUGH_PERMISSION && confirmed) {
            System.out.println("Current signWeight is:");
            System.out.println(Utils.printTransactionSignWeight(weight));
            if (multi) {
              return transaction;
            }
            System.out.println("Please confirm if continue add signature enter " + greenBoldHighlight("y/Y") + ", else any other");
            if (!confirm()) {
              showTransactionAfterSign(transaction);
              TransactionSignManager.getInstance().setTransaction(null);
              throw new CancelException("User cancelled");
            }
            TransactionSignManager.getInstance().setTransaction(null);
            continue;
          }
          TransactionSignManager.getInstance().setTransaction(null);
          throw new CancelException(weight.getResult().getMessage());
        } else {
          return null;
        }
      } else {
        if (isEckey) {
          transaction = TransactionUtils.sign(transaction, this.getEcKey(wf, passwd));
        } else {
          transaction = TransactionUtils.sign(transaction, this.getSM2(wf, passwd));
        }
        Response.TransactionSignWeight weight = getTransactionSignWeight(transaction);
        if (weight.getResult().getCode() == Response.TransactionSignWeight.Result.response_code.ENOUGH_PERMISSION) {
          break;
        }
        if (weight.getResult().getCode() == Response.TransactionSignWeight.Result.response_code.NOT_ENOUGH_PERMISSION) {
          System.out.println("Current signWeight is:");
          System.out.println(Utils.printTransactionSignWeight(weight));
          if (multi) {
            return transaction;
          }
          System.out.println("Please confirm if continue add signature enter " + greenBoldHighlight("y/Y") + ", else any other");
          if (!confirm()) {
            showTransactionAfterSign(transaction);
            throw new CancelException("User cancelled");
          }
          continue;
        }
        throw new CancelException(weight.getResult().getMessage());
      }
    }
    return transaction;
  }

  private boolean processTransactionExtention(Response.TransactionExtention transactionExtention, boolean multi)
      throws IOException, CipherException, CancelException {
    if (transactionExtention == null) {
      return false;
    }
    Response.TransactionReturn ret = transactionExtention.getResult();
    if (!ret.getResult()) {
      System.out.println("Code = " + ret.getCode());
      System.out.println("Message = " + ret.getMessage().toStringUtf8());
      return false;
    }
    Chain.Transaction transaction = transactionExtention.getTransaction();
    if (transaction.getRawData().getContractCount() == 0) {
      System.out.println("Transaction is empty");
      return false;
    }
    if (transaction.getRawData().getContract(0).getType()
        == Chain.Transaction.Contract.ContractType.ShieldedTransferContract) {
      return false;
    }
    Chain.Transaction.Contract.ContractType type = transaction.getRawData().getContract(0).getType();
    if (multi && !CONTRACT_TYPE_SET.contains(type)) {
      System.out.println("The current transaction type does not support distributed multi sign temporarily!");
      return false;
    }
    System.out.println(Utils.printTransactionExceptId(transactionExtention.getTransaction()));
    System.out.println("Before sign transaction hex string is " +
        ByteArray.toHexString(transaction.toByteArray()));
    transaction = signTransaction(transaction, multi);
    if (transaction == null) {
      return false;
    }
    showTransactionAfterSign(transaction);
    if (multi) {
      return isMultiSignSuccess(transaction);
    }
    boolean success = apiCli.broadcastTransaction(transaction);
    if (success) {
      TxHistoryManager txHistoryManager = new TxHistoryManager(encode58Check(getAddress()));
      String id = ByteArray.toHexString(Sha256Sm3Hash.hash(transaction.getRawData().toByteArray()));
      Tx tx = getTx(transaction);
      tx.setId(id);
      tx.setTimestamp(LocalDateTime.now());
      tx.setStatus("success");
      if (getCurrentNetwork() == CUSTOM && getCustomNodes() != null) {
        tx.setFullNodeEndpoint(getCustomNodes().getLeft().getLeft());
      }
      txHistoryManager.addTransaction(getCurrentNetwork(), tx);
    }
    return success;
  }

  private void showTransactionAfterSign(Chain.Transaction transaction)
      throws InvalidProtocolBufferException {
    System.out.println("After sign transaction hex string is " +
        ByteArray.toHexString(transaction.toByteArray()));
    System.out.println("TxId is " + blueBoldHighlight(ByteArray.toHexString(
        Sha256Sm3Hash.hash(transaction.getRawData().toByteArray()))));

    if (transaction.getRawData().getContract(0).getType() == Chain.Transaction.Contract.ContractType.CreateSmartContract) {
      CreateSmartContract createSmartContract = transaction.getRawData().getContract(0)
          .getParameter().unpack(CreateSmartContract.class);
      byte[] contractAddress = generateContractAddress(
          createSmartContract.getOwnerAddress().toByteArray(), transaction);
      System.out.println(
          "Your smart contract address will be: " + WalletApi.encode58Check(contractAddress));
    }
  }

  private boolean processTransaction(Chain.Transaction transaction)
      throws IOException, CipherException, CancelException {
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      return false;
    }

    System.out.println(Utils.printTransactionExceptId(transaction));
    System.out.println(
        "Before sign transaction hex string is "
            + ByteArray.toHexString(transaction.toByteArray()));

    transaction = signTransaction(transaction, false);
    if (transaction == null) {
      return false;
    }
    showTransactionAfterSign(transaction);
    boolean success = apiCli.broadcastTransaction(transaction);
    if (success) {
      TxHistoryManager txHistoryManager = new TxHistoryManager(encode58Check(getAddress()));
      String id = ByteArray.toHexString(Sha256Sm3Hash.hash(transaction.getRawData().toByteArray()));
      Tx tx = getTx(transaction);
      tx.setId(id);
      tx.setTimestamp(LocalDateTime.now());
      tx.setStatus("success");
      if (getCurrentNetwork() == CUSTOM && getCustomNodes() != null) {
        tx.setFullNodeEndpoint(getCustomNodes().getLeft().getLeft());
      }
      txHistoryManager.addTransaction(getCurrentNetwork(), tx);
    }
    return success;
  }

  public static TransactionSignWeight getTransactionSignWeight(Transaction transaction)
      throws InvalidProtocolBufferException {
    return TransactionSignWeight.parseFrom(
        getTransactionSignWeight(Chain.Transaction.parseFrom(transaction.toByteArray())).toByteArray());
  }

  public static Response.TransactionSignWeight getTransactionSignWeight(Chain.Transaction transaction) {
    return apiCli.getTransactionSignWeight(transaction);
  }

  public static Response.TransactionApprovedList getTransactionApprovedList(Chain.Transaction transaction) {
    return apiCli.getTransactionApprovedList(transaction);
  }

  public boolean sendCoin(byte[] owner, byte[] to, long amount, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }
    if (multi) {
      if (!DecodeUtil.addressValid(owner) || !DecodeUtil.addressValid(to)) {
        System.out.println("Invalid ownerAddress or Invalid toAddress!");
        return false;
      }
      if (Arrays.equals(to, owner)) {
        System.out.println("Cannot transfer TRX to yourself.");
        return false;
      }
      if (amount <= 0) {
        System.out.println("Amount must be greater than 0.");
        return false;
      }
      long balance = queryAccount(owner).getBalance();
      if (balance < amount) {
        System.out.println("balance is not sufficient.");
        return false;
      }
      if (balance - amount < 200_0000L) {
        System.out.println("You need to have at least 2 TRX to pay the fee.");
        return false;
      }
      if (!isControlled(owner)) {
        return false;
      }
    }
    Response.TransactionExtention transactionExtention = apiCli.transfer(owner, to, amount);
    return processTransactionExtention(transactionExtention, multi);
  }

  private boolean isControlled(byte[] owner) {
    List<AuthInfo> authInfoList = multiSignService.queryMultiAuth(encode58Check(getAddress()));
    List<String> ownerAddressList = authInfoList.stream()
        .map(AuthInfo::getOwnerAddress)
        .collect(Collectors.toList());
    if (ownerAddressList.contains(encode58Check(owner))) {
      return true;
    } else {
      System.out.println("The owner address you entered is not a controlled address.");
      return false;
    }
  }

  private boolean isMultiSignSuccess(Chain.Transaction transaction) throws IOException {
    String printTransaction = Utils.printTransaction(transaction);
    JSONObject transactionJO = JSON.parseObject(printTransaction);
    transactionJO.put("visible", true);
//    JSONArray signatures = new JSONArray();
//    byte[] hash = Sha256Sm3Hash.hash(transaction.getRawData().toByteArray());
//    String signature = signTransaction(hash);
//    signatures.add(signature);
//    transactionJO.put("signature", signatures);
    String resp = multiSignService.submitMultiSignTx(encode58Check(getAddress()), transactionJO);
    JSONObject respJO = JSON.parseObject(resp);
    return respJO.getIntValue("code") == 0;
  }

  public Response.TransactionExtention transferTE(String owner, String to, long amount) throws IllegalException {
    return apiCli.transfer(decodeFromBase58Check(owner), decodeFromBase58Check(to), amount);
  }

  public boolean updateAccount(byte[] owner, byte[] accountNameBytes, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }

    Response.TransactionExtention transactionExtention = apiCli.updateAccount(owner, accountNameBytes);
    return processTransactionExtention(transactionExtention, multi);
  }

  public boolean setAccountId(byte[] owner, byte[] accountIdBytes)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }

    Chain.Transaction transaction = apiCli.setAccountId(accountIdBytes, owner);
    if (transaction == null || transaction.getRawData().getContractCount() == 0) {
      return false;
    }

    return processTransaction(transaction);
  }

  public boolean updateAsset(
      byte[] owner, byte[] description, byte[] url, long newLimit, long newPublicLimit, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }

    Response.TransactionExtention transactionExtention = apiCli.updateAsset(owner, description, url, newLimit, newPublicLimit);
    return processTransactionExtention(transactionExtention, multi);
  }

  public boolean transferAsset(byte[] owner, byte[] to, byte[] assertName, long amount, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }
    Response.TransactionExtention transactionExtention = apiCli.transferTrc10(owner, to, assertName, amount);
    return processTransactionExtention(transactionExtention, multi);
  }

  public boolean participateAssetIssue(byte[] owner, byte[] to, byte[] assertName, long amount, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }

    Response.TransactionExtention transactionExtention = apiCli.participateAssetIssueTransaction(owner, to, assertName, amount);
    return processTransactionExtention(transactionExtention, multi);
  }

  public static boolean broadcastTransaction(byte[] transactionBytes)
      throws InvalidProtocolBufferException {
    Chain.Transaction transaction = Chain.Transaction.parseFrom(transactionBytes);
    return apiCli.broadcastTransaction(transaction);
  }

  public static boolean broadcastTransaction(Transaction transaction) throws InvalidProtocolBufferException {
    return apiCli.broadcastTransaction(Chain.Transaction.parseFrom(transaction.toByteArray()));
  }

  public static boolean broadcastTransaction(Chain.Transaction transaction) {
    return apiCli.broadcastTransaction(transaction);
  }

  public boolean createAssetIssue(byte[] ownerAddress, String name, String abbrName,
                                  long totalSupply, int trxNum, int icoNum, int precision,
                                  long startTime, long endTime, int voteScore, String description,
                                  String url, long freeNetLimit, long publicFreeNetLimit,
                                  HashMap<String, String> frozenSupply, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    Response.TransactionExtention transactionExtention = apiCli.createAssetIssue(ownerAddress, name,
        abbrName, totalSupply, trxNum, icoNum, startTime, endTime, url, freeNetLimit,
        publicFreeNetLimit, precision, frozenSupply, description);
    return processTransactionExtention(transactionExtention, multi);
  }

  public boolean createAccount(byte[] owner, byte[] address, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }
    Response.TransactionExtention transactionExtention = apiCli.createAccount(owner, address);
    return processTransactionExtention(transactionExtention, multi);
  }

  public boolean createWitness(byte[] owner, byte[] url, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }
    Response.TransactionExtention transactionExtention = apiCli.createWitness(owner, url);
    return processTransactionExtention(transactionExtention, multi);
  }

  public boolean updateWitness(byte[] owner, byte[] url, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }
    Response.TransactionExtention transactionExtention = apiCli.updateWitness(owner, url);
    return processTransactionExtention(transactionExtention, multi);
  }

  public static Chain.Block getBlock(long blockNum) throws IllegalException {
    return apiCli.getBlock(blockNum);
  }

  public static Response.BlockExtention getBlock2(long blockNum) throws IllegalException {
    try {
      return apiCli.getBlock2(blockNum);
    } catch (IllegalException e) {
      return Response.BlockExtention.getDefaultInstance();
    }
  }

  public static long getTransactionCountByBlockNum(long blockNum) {
    return apiCli.getTransactionCountByBlockNum(blockNum);
  }

  public boolean voteWitness(byte[] owner, HashMap<String, String> witness, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }
    if (multi) {
      if (!DecodeUtil.addressValid(owner)) {
        System.out.println("Invalid ownerAddress!");
        return false;
      }
      if (witness.size() == 0) {
        System.out.println("VoteNumber must more than 0");
        return false;
      }
      if (witness.size() > 30) {
        System.out.println("VoteNumber more than maxVoteNumber 30");
        return false;
      }
      long sum = 0L;
      for (Map.Entry<String, String> entry : witness.entrySet()) {
        String voteAddress = entry.getKey();
        long voteCount = Long.parseLong(entry.getValue());
        if (!DecodeUtil.addressValid(decodeFromBase58Check(voteAddress))) {
          System.out.println("Invalid vote address!");
          return false;
        }
        if (voteCount <= 0) {
          System.out.println("vote count must be greater than 0");
          return false;
        }
        sum = LongMath.checkedAdd(sum, voteCount);
      }
      Response.Account account = queryAccount(owner);
      long tronPower = getTronPower(account);
      sum = LongMath.checkedMultiply(sum, TRX_PRECISION);
      if (sum > tronPower) {
        System.out.println("The total number of votes[" + sum + "] is greater than the tronPower["
            + tronPower + "]");
        return false;
      }
      if (!isControlled(owner)) {
        return false;
      }
    }
    Response.TransactionExtention transactionExtention = apiCli.voteWitness(owner, witness);
    return processTransactionExtention(transactionExtention, multi);
  }

  public long getTronPower(Response.Account account) {
    long tp = 0;
    for (int i = 0; i < account.getFrozenCount(); ++i) {
      tp += account.getFrozen(i).getFrozenBalance();
    }

    tp += account.getAccountResource().getFrozenBalanceForEnergy().getFrozenBalance();
    tp += account.getDelegatedFrozenBalanceForBandwidth();
    tp += account.getAccountResource().getDelegatedFrozenBalanceForEnergy();

    tp += account.getFrozenV2List().stream().filter(o -> o.getType() != TRON_POWER)
        .mapToLong(Response.Account.FreezeV2::getAmount).sum();
    tp += account.getDelegatedFrozenV2BalanceForBandwidth();
    tp += account.getAccountResource().getDelegatedFrozenV2BalanceForEnergy();
    return tp;
  }

  public static TransferContract createTransferContract(byte[] to, byte[] owner, long amount) {
    TransferContract.Builder builder = TransferContract.newBuilder();
    ByteString bsTo = ByteString.copyFrom(to);
    ByteString bsOwner = ByteString.copyFrom(owner);
    builder.setToAddress(bsTo);
    builder.setOwnerAddress(bsOwner);
    builder.setAmount(amount);

    return builder.build();
  }

  public static TransferAssetContract createTransferAssetContract(
      byte[] to, byte[] assertName, byte[] owner, long amount) {
    TransferAssetContract.Builder builder = TransferAssetContract.newBuilder();
    ByteString bsTo = ByteString.copyFrom(to);
    ByteString bsName = ByteString.copyFrom(assertName);
    ByteString bsOwner = ByteString.copyFrom(owner);
    builder.setToAddress(bsTo);
    builder.setAssetName(bsName);
    builder.setOwnerAddress(bsOwner);
    builder.setAmount(amount);

    return builder.build();
  }

  public static ParticipateAssetIssueContract participateAssetIssueContract(
      byte[] to, byte[] assertName, byte[] owner, long amount) {
    ParticipateAssetIssueContract.Builder builder = ParticipateAssetIssueContract.newBuilder();
    ByteString bsTo = ByteString.copyFrom(to);
    ByteString bsName = ByteString.copyFrom(assertName);
    ByteString bsOwner = ByteString.copyFrom(owner);
    builder.setToAddress(bsTo);
    builder.setAssetName(bsName);
    builder.setOwnerAddress(bsOwner);
    builder.setAmount(amount);

    return builder.build();
  }

  public static AccountUpdateContract createAccountUpdateContract(
      byte[] accountName, byte[] address) {
    AccountUpdateContract.Builder builder = AccountUpdateContract.newBuilder();
    ByteString basAddreess = ByteString.copyFrom(address);
    ByteString bsAccountName = ByteString.copyFrom(accountName);
    builder.setAccountName(bsAccountName);
    builder.setOwnerAddress(basAddreess);

    return builder.build();
  }

  public static SetAccountIdContract createSetAccountIdContract(byte[] accountId, byte[] address) {
    SetAccountIdContract.Builder builder = SetAccountIdContract.newBuilder();
    ByteString bsAddress = ByteString.copyFrom(address);
    ByteString bsAccountId = ByteString.copyFrom(accountId);
    builder.setAccountId(bsAccountId);
    builder.setOwnerAddress(bsAddress);

    return builder.build();
  }

  public static UpdateAssetContract createUpdateAssetContract(
      byte[] address, byte[] description, byte[] url, long newLimit, long newPublicLimit) {
    UpdateAssetContract.Builder builder = UpdateAssetContract.newBuilder();
    ByteString basAddreess = ByteString.copyFrom(address);
    builder.setDescription(ByteString.copyFrom(description));
    builder.setUrl(ByteString.copyFrom(url));
    builder.setNewLimit(newLimit);
    builder.setNewPublicLimit(newPublicLimit);
    builder.setOwnerAddress(basAddreess);

    return builder.build();
  }

  public static AccountCreateContract createAccountCreateContract(byte[] owner, byte[] address) {
    AccountCreateContract.Builder builder = AccountCreateContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setAccountAddress(ByteString.copyFrom(address));

    return builder.build();
  }

  public static WitnessCreateContract createWitnessCreateContract(byte[] owner, byte[] url) {
    WitnessCreateContract.Builder builder = WitnessCreateContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setUrl(ByteString.copyFrom(url));

    return builder.build();
  }

  public static WitnessUpdateContract createWitnessUpdateContract(byte[] owner, byte[] url) {
    WitnessUpdateContract.Builder builder = WitnessUpdateContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setUpdateUrl(ByteString.copyFrom(url));

    return builder.build();
  }

  public static VoteWitnessContract createVoteWitnessContract(byte[] owner,
                                                              HashMap<String, String> witness) {
    VoteWitnessContract.Builder builder = VoteWitnessContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    for (String addressBase58 : witness.keySet()) {
      String value = witness.get(addressBase58);
      long count = Long.parseLong(value);
      VoteWitnessContract.Vote.Builder voteBuilder = VoteWitnessContract.Vote.newBuilder();
      byte[] address = WalletApi.decodeFromBase58Check(addressBase58);
      if (address == null) {
        continue;
      }
      voteBuilder.setVoteAddress(ByteString.copyFrom(address));
      voteBuilder.setVoteCount(count);
      builder.addVotes(voteBuilder.build());
    }

    return builder.build();
  }

  public static boolean passwordValid(char[] password) {
    if (ArrayUtils.isEmpty(password)) {
      throw new IllegalArgumentException("password is empty");
    }
    if (password.length < 6) {
      System.out.println("Warning: Password is too short !!");
      return false;
    }
    // Other rule;
    int level = CheckStrength.checkPasswordStrength(password);
    if (level <= 4) {
      System.out.println("Your password is too weak!");
      System.out.println("The password should be at least 8 characters.");
      System.out.println("The password should contains uppercase, lowercase, numeric and other.");
      System.out.println(
          "The password should not contain more than 3 duplicate numbers or letters; For example: 1111.");
      System.out.println(
          "The password should not contain more than 3 consecutive Numbers or letters; For example: 1234.");
      System.out.println("The password should not contain weak password combination; For example:");
      System.out.println("ababab, abcabc, password, passw0rd, p@ssw0rd, admin1234, etc.");
      return false;
    }
    return true;
  }

  public static boolean addressValid(String addressBase58) {
    byte[] address = decode58Check(addressBase58);
    return ArrayUtils.isNotEmpty(address);
  }

  public static boolean addressValid(byte[] address) {
    if (ArrayUtils.isEmpty(address)) {
      System.out.println("Warning: Address is empty !!");
      return false;
    }
    if (address.length != CommonConstant.ADDRESS_SIZE) {
      System.out.println(
          "Warning: Address length need "
              + CommonConstant.ADDRESS_SIZE
              + " but "
              + address.length
              + " !!");
      return false;
    }
    byte preFixbyte = address[0];
    if (preFixbyte != WalletApi.getAddressPreFixByte()) {
      System.out.println(
          "Warning: Address need prefix with "
              + WalletApi.getAddressPreFixByte()
              + " but "
              + preFixbyte
              + " !!");
      return false;
    }
    // Other rule;
    return true;
  }

  public static String encode58Check(byte[] input) {
    if (ArrayUtils.isEmpty(input)) {
      return EMPTY;
    }
    byte[] hash0 = Sha256Sm3Hash.hash(input);
    byte[] hash1 = Sha256Sm3Hash.hash(hash0);
    byte[] inputCheck = new byte[input.length + 4];
    System.arraycopy(input, 0, inputCheck, 0, input.length);
    System.arraycopy(hash1, 0, inputCheck, input.length, 4);
    return encode(inputCheck);
  }

  public static byte[] decode58Check(String input) {
    byte[] decodeCheck = Base58.decode(input);
    if (decodeCheck.length <= 4) {
      return null;
    }
    byte[] decodeData = new byte[decodeCheck.length - 4];
    System.arraycopy(decodeCheck, 0, decodeData, 0, decodeData.length);
    byte[] hash0 = Sha256Sm3Hash.hash(decodeData);
    byte[] hash1 = Sha256Sm3Hash.hash(hash0);
    if (hash1[0] == decodeCheck[decodeData.length]
        && hash1[1] == decodeCheck[decodeData.length + 1]
        && hash1[2] == decodeCheck[decodeData.length + 2]
        && hash1[3] == decodeCheck[decodeData.length + 3]) {
      return decodeData;
    }
    return null;
  }

  public static byte[] decodeFromBase58Check(String addressBase58) {
    if (isEmpty(addressBase58)) {
      System.out.println("Warning: Address is empty !!");
      return null;
    }
    byte[] address = decode58Check(addressBase58);
    if (!addressValid(address)) {
      return null;
    }
    return address;
  }

  public static String getHexAddress(final String address) {
    if (address != null) {
      byte[] addressByte = decodeFromBase58Check(address);
      if (addressByte != null) {
        return ByteArray.toHexString(addressByte);
      }
    }
    return null;
  }

  public static boolean priKeyValid(byte[] priKey) {
    if (ArrayUtils.isEmpty(priKey)) {
      System.out.println("Warning: PrivateKey is empty !!");
      return false;
    }
    if (priKey.length != 32) {
      System.out.println("Warning: PrivateKey length need 64 but " + priKey.length + " !!");
      return false;
    }
    // Other rule;
    return true;
  }

  public static Response.WitnessList listWitnesses() {
    Response.WitnessList witnessList = apiCli.listWitnesses();
    if (witnessList != null) {
      List<Response.Witness> list = witnessList.getWitnessesList();
      List<Response.Witness> newList = new ArrayList<>();
      newList.addAll(list);
      newList.sort((o1, o2) -> Long.compare(o2.getVoteCount(), o1.getVoteCount()));
      Response.WitnessList.Builder builder = Response.WitnessList.newBuilder();
      newList.forEach(builder::addWitnesses);
      witnessList = builder.build();
    }
    return witnessList;
  }

  public static Response.AssetIssueList getAssetIssueList() {
    return apiCli.getAssetIssueList();
  }

  public static Response.AssetIssueList getPaginatedAssetIssueList(long offset, long limit) {
    return apiCli.getPaginatedAssetIssueList(offset, limit);
  }

  public static Response.ProposalList getProposalListPaginated(long offset, long limit) {
    return apiCli.getPaginatedProposalList(offset, limit);
  }

  public static Response.ExchangeList getExchangeListPaginated(long offset, long limit) {
    return apiCli.getPaginatedExchangeList(offset, limit);
  }

  public static Response.NodeList listNodes() throws IllegalException {
    return apiCli.listNodes();
  }

  public static Response.AssetIssueList getAssetIssueByAccount(byte[] address) {
    return apiCli.getAssetIssueByAccount(address);
  }

  public static Response.AccountNetMessage getAccountNet(byte[] address) {
    return apiCli.getAccountNet(address);
  }

  public static Response.AccountResourceMessage getAccountResource(byte[] address) {
    return apiCli.getAccountResource(address);
  }

  public static Contract.AssetIssueContract getAssetIssueByName(String assetName) {
    return apiCli.getAssetIssueByName(assetName);
  }

  public static Response.AssetIssueList getAssetIssueListByName(String assetName) {
    return apiCli.getAssetIssueListByName(assetName);
  }

  public static Contract.AssetIssueContract getAssetIssueById(String assetId) {
    return apiCli.getAssetIssueById(assetId);
  }

  public static long getNextMaintenanceTime() {
    return apiCli.getNextMaintenanceTime();
  }

  public static Chain.Transaction getTransactionById(String txId) throws IllegalException {
    try {
      return apiCli.getTransactionById(txId);
    } catch (IllegalException e) {
      return Chain.Transaction.getDefaultInstance();
    }
  }

  public static Response.TransactionInfo getTransactionInfoById(String txId) throws IllegalException {
    try {
      return apiCli.getTransactionInfoById(txId);
    } catch (IllegalException e) {
      return Response.TransactionInfo.getDefaultInstance();
    }
  }

  public boolean freezeBalance(
      byte[] ownerAddress,
      long frozenBalance,
      long frozenDuration,
      int resourceCode,
      byte[] receiverAddress, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (ownerAddress == null) {
      ownerAddress = getAddress();
    }
    Response.TransactionExtention transactionExtention = apiCli.freezeBalance(ownerAddress, frozenBalance, (int) frozenDuration, resourceCode, receiverAddress);
    return processTransactionExtention(transactionExtention, multi);
  }

  public boolean freezeBalanceV2(
      byte[] ownerAddress,
      long frozenBalance,
      int resourceCode, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (ownerAddress == null) {
      ownerAddress = getAddress();
    }
    if (multi) {
      if (!DecodeUtil.addressValid(ownerAddress)) {
        System.out.println("Invalid ownerAddress!");
        return false;
      }
      if (frozenBalance < TRX_PRECISION) {
        System.out.println("frozenBalance must be greater than or equal to 1 TRX");
        return false;
      }
      Response.Account account = queryAccount(ownerAddress);
      if (frozenBalance > account.getBalance()) {
        System.out.println("frozenBalance must be less than or equal to accountBalance");
        return false;
      }
      if (!isControlled(ownerAddress)) {
        return false;
      }
    }
    Response.TransactionExtention transactionExtention = apiCli.freezeBalanceV2(ownerAddress, frozenBalance, resourceCode);
    return processTransactionExtention(transactionExtention, multi);
  }

  public boolean unfreezeBalance(byte[] ownerAddress, int resourceCode, byte[] receiverAddress, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (ownerAddress == null) {
      ownerAddress = getAddress();
    }
    Response.TransactionExtention transactionExtention = apiCli.unfreezeBalance(ownerAddress, resourceCode, receiverAddress);
    return processTransactionExtention(transactionExtention, multi);
  }

  public boolean unfreezeBalanceV2(byte[] ownerAddress, long unfreezeBalance
      , int resourceCode, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (ownerAddress == null) {
      ownerAddress = getAddress();
    }
    if (multi) {
      if (!DecodeUtil.addressValid(ownerAddress)) {
        System.out.println("Invalid ownerAddress!");
        return false;
      }
      Response.Account account = queryAccount(ownerAddress);
      long frozenAmount = account.getFrozenV2List().stream()
          .filter(f -> f.getType().getNumber() == resourceCode)
          .mapToLong(Response.Account.FreezeV2::getAmount)
          .findFirst()
          .orElse(0L);
      if (frozenAmount <= 0) {
        System.out.println("No amount can be unfrozen.");
        return false;
      }
      if (unfreezeBalance > frozenAmount) {
        System.out.println("Exceeds the current maximum unfreeze amount");
        return false;
      }
      if (!isControlled(ownerAddress)) {
        return false;
      }
    }
    Response.TransactionExtention transactionExtention = apiCli.unfreezeBalanceV2(ownerAddress, unfreezeBalance, resourceCode);
    return processTransactionExtention(transactionExtention, multi);
  }

  public boolean withdrawExpireUnfreeze(byte[] ownerAddress, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (ownerAddress == null) {
      ownerAddress = getAddress();
    }
    if (multi) {
      if (!DecodeUtil.addressValid(ownerAddress)) {
        System.out.println("Invalid ownerAddress!");
        return false;
      }
      long canWithdrawUnfreezeAmount = apiCli.getCanWithdrawUnfreezeAmount(ownerAddress, System.currentTimeMillis());
      if (canWithdrawUnfreezeAmount <= 0) {
        System.out.println("no unFreeze balance to withdraw");
        return false;
      }
      if (!isControlled(ownerAddress)) {
        return false;
      }
    }
    Response.TransactionExtention transactionExtention = apiCli.withdrawExpireUnfreeze(ownerAddress);
    return processTransactionExtention(transactionExtention, multi);
  }

  public boolean delegateResource(byte[] ownerAddress, long balance
      , int resourceCode, byte[] receiverAddress, boolean lock, long lockPeriod, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (ownerAddress == null) {
      ownerAddress = getAddress();
    }
    if (multi) {
      if (!DecodeUtil.addressValid(ownerAddress)) {
        System.out.println("Invalid ownerAddress!");
        return false;
      }
      if (!DecodeUtil.addressValid(receiverAddress)) {
        System.out.println("Invalid receiverAddress!");
        return false;
      }
      if (Arrays.equals(receiverAddress, ownerAddress)) {
        System.out.println("receiverAddress must not be the same as ownerAddress");
        return false;
      }
      if (balance < TRX_PRECISION) {
        System.out.println("delegateBalance must be greater than or equal to 1 TRX");
        return false;
      }
      long canDelegatedMaxSize = apiCli.getCanDelegatedMaxSize(ownerAddress, resourceCode);
      if (balance > canDelegatedMaxSize) {
        System.out.println("delegateBalance must be less than or equal to available FreezeV2 balance");
        return false;
      }
      List<Response.ChainParameters.ChainParameter> chainParameterList = apiCli.getChainParameters().getChainParameterList();
      long maxDelegateLockPeriod = chainParameterList.stream()
          .filter(p -> "getMaxDelegateLockPeriod".equals(p.getKey()))
          .map(Response.ChainParameters.ChainParameter::getValue)
          .findFirst()
          .orElse(86400L);
      if (lockPeriod < 0 || lockPeriod > maxDelegateLockPeriod) {
        System.out.println(
            "The lock period of delegate resource cannot be less than 0 and cannot exceed "
                + maxDelegateLockPeriod + "!");
        return false;
      }
      if (!isControlled(ownerAddress)) {
        return false;
      }
    }
    Response.TransactionExtention transactionExtention = apiCli.delegateResource(ownerAddress, balance, resourceCode, receiverAddress, lock, lockPeriod);
    return processTransactionExtention(transactionExtention, multi);
  }

  public boolean unDelegateResource(byte[] ownerAddress, long balance
      , int resourceCode, byte[] receiverAddress, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (ownerAddress == null) {
      ownerAddress = getAddress();
    }
    if (multi) {
      if (!DecodeUtil.addressValid(ownerAddress)) {
        System.out.println("Invalid ownerAddress!");
        return false;
      }
      if (!DecodeUtil.addressValid(receiverAddress)) {
        System.out.println("Invalid receiverAddress!");
        return false;
      }
      if (Arrays.equals(receiverAddress, ownerAddress)) {
        System.out.println("receiverAddress must not be the same as ownerAddress");
        return false;
      }
      List<Response.DelegatedResource> delegatedResourceList = apiCli.getDelegatedResourceV2(encode58Check(ownerAddress), encode58Check(receiverAddress)).getDelegatedResourceList();
      if (delegatedResourceList.stream().allMatch(this::emptyResource)) {
        System.out.println("delegated Resource does not exist");
        return false;
      }
      Response.DelegatedResource unlockDelegatedResource = null;
      Response.DelegatedResource lockDelegatedResource = null;
      if (!delegatedResourceList.isEmpty()) {
        unlockDelegatedResource = delegatedResourceList.get(0);
        if (delegatedResourceList.size() > 1) {
          lockDelegatedResource = delegatedResourceList.get(1);
        }
      }
      long delegateBalance = 0;
      boolean isBandwidth = resourceCode == 0;
      long now = System.currentTimeMillis();
      if (!emptyResource(unlockDelegatedResource)) {
        if (isBandwidth) {
          delegateBalance += unlockDelegatedResource.getFrozenBalanceForBandwidth();
        } else {
          delegateBalance += unlockDelegatedResource.getFrozenBalanceForEnergy();
        }
      }
      if (!emptyResource(lockDelegatedResource)) {
        boolean expired;
        if (isBandwidth) {
          expired = lockDelegatedResource.getExpireTimeForBandwidth() < now;
        } else {
          expired = lockDelegatedResource.getExpireTimeForEnergy() < now;
        }
        if (expired) {
          delegateBalance += isBandwidth
              ? lockDelegatedResource.getFrozenBalanceForBandwidth()
              : lockDelegatedResource.getFrozenBalanceForEnergy();
        }
      }
      if (delegateBalance < balance) {
        System.out.println(
            "insufficient delegatedFrozenBalance(" + (isBandwidth ? "BANDWIDTH" : "ENERGY")
                + "), request=" + balance + ", unlock_balance=" + delegateBalance);
        return false;
      }
      if (balance <= 0) {
        System.out.println("unDelegateBalance must be more than 0 TRX");
        return false;
      }
      if (!isControlled(ownerAddress)) {
        return false;
      }
    }
    Response.TransactionExtention transactionExtention = apiCli.unDelegateResource(ownerAddress, balance, resourceCode, receiverAddress);
    return processTransactionExtention(transactionExtention, multi);
  }
  private boolean emptyResource(Response.DelegatedResource resource) {
    return Objects.isNull(resource) || (resource.getExpireTimeForBandwidth() == 0
        && resource.getExpireTimeForEnergy() == 0
        && resource.getFrozenBalanceForBandwidth() == 0
        && resource.getFrozenBalanceForEnergy() == 0);
  }
  public boolean cancelAllUnfreezeV2(byte[] ownerAddress, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (ownerAddress == null) {
      ownerAddress = getAddress();
    }
    if (multi) {
      Response.Account account = queryAccount(ownerAddress);
      if (account.getUnfrozenV2List().isEmpty()) {
        System.out.println("No unfreezeV2 list to cancel");
        return false;
      }
      if (!isControlled(ownerAddress)) {
        return false;
      }
    }
    Response.TransactionExtention transactionExtention = apiCli.cancelAllUnfreezeV2(ownerAddress);
    return processTransactionExtention(transactionExtention, multi);
  }

  private UnfreezeBalanceContract createUnfreezeBalanceContract(
      byte[] address, int resourceCode, byte[] receiverAddress) {
    if (address == null) {
      address = getAddress();
    }

    UnfreezeBalanceContract.Builder builder =
        UnfreezeBalanceContract.newBuilder();
    ByteString byteAddress = ByteString.copyFrom(address);
    builder.setOwnerAddress(byteAddress).setResourceValue(resourceCode);

    if (receiverAddress != null) {
      ByteString receiverAddressBytes =
          ByteString.copyFrom(Objects.requireNonNull(receiverAddress));
      builder.setReceiverAddress(receiverAddressBytes);
    }

    return builder.build();
  }

  private BalanceContract.UnfreezeBalanceV2Contract createUnfreezeBalanceContractV2(
      byte[] address, long unfreezeBalance, int resourceCode) {
    if (address == null) {
      address = getAddress();
    }

    BalanceContract.UnfreezeBalanceV2Contract.Builder builder =
        BalanceContract.UnfreezeBalanceV2Contract.newBuilder();
    ByteString byteAddress = ByteString.copyFrom(address);
    builder.setOwnerAddress(byteAddress).setResourceValue(resourceCode).setUnfreezeBalance(unfreezeBalance);

    return builder.build();
  }

  private BalanceContract.WithdrawExpireUnfreezeContract createWithdrawExpireUnfreezeContract(byte[] address) {
    if (address == null) {
      address = getAddress();
    }

    BalanceContract.WithdrawExpireUnfreezeContract.Builder builder =
        BalanceContract.WithdrawExpireUnfreezeContract.newBuilder();
    ByteString byteAddreess = ByteString.copyFrom(address);
    builder.setOwnerAddress(byteAddreess);

    return builder.build();
  }

  private BalanceContract.DelegateResourceContract createDelegateResourceContract(
      byte[] address, long balance
      , int resourceCode, byte[] receiver, boolean lock, long lockPeriod) {
    if (address == null) {
      address = getAddress();
    }

    BalanceContract.DelegateResourceContract.Builder builder =
        BalanceContract.DelegateResourceContract.newBuilder();
    ByteString byteAddress = ByteString.copyFrom(address);
    ByteString byteReceiverAddress = ByteString.copyFrom(receiver);
    builder.setOwnerAddress(byteAddress)
        .setResourceValue(resourceCode)
        .setBalance(balance)
        .setReceiverAddress(byteReceiverAddress)
        .setLock(lock)
        .setLockPeriod(lockPeriod);

    return builder.build();
  }

  private BalanceContract.UnDelegateResourceContract createUnDelegateResourceContract(
      byte[] address, long balance
      , int resourceCode, byte[] receiver) {
    if (address == null) {
      address = getAddress();
    }

    BalanceContract.UnDelegateResourceContract.Builder builder =
        BalanceContract.UnDelegateResourceContract.newBuilder();
    ByteString byteAddress = ByteString.copyFrom(address);
    ByteString byteReceiverAddress = ByteString.copyFrom(receiver);
    builder.setOwnerAddress(byteAddress)
        .setResourceValue(resourceCode)
        .setBalance(balance)
        .setReceiverAddress(byteReceiverAddress);

    return builder.build();
  }

  private CancelAllUnfreezeV2Contract createCancelAllUnfreezeV2Contract() {
    CancelAllUnfreezeV2Contract.Builder builder = CancelAllUnfreezeV2Contract.newBuilder();
    ByteString byteAddress = ByteString.copyFrom(getAddress());
    builder.setOwnerAddress(byteAddress);
    return builder.build();
  }

  public boolean unfreezeAsset(byte[] ownerAddress, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (ownerAddress == null) {
      ownerAddress = getAddress();
    }
    Response.TransactionExtention transactionExtention = apiCli.unfreezeAsset(ownerAddress);
    return processTransactionExtention(transactionExtention, multi);
  }

  private UnfreezeAssetContract createUnfreezeAssetContract(byte[] address) {
    if (address == null) {
      address = getAddress();
    }

    UnfreezeAssetContract.Builder builder = UnfreezeAssetContract
        .newBuilder();
    ByteString byteAddreess = ByteString.copyFrom(address);
    builder.setOwnerAddress(byteAddreess);
    return builder.build();
  }

  public boolean withdrawBalance(byte[] ownerAddress, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (ownerAddress == null) {
      ownerAddress = getAddress();
    }
    if (multi) {
      if (!DecodeUtil.addressValid(ownerAddress)) {
        System.out.println("Invalid ownerAddress!");
        return false;
      }
      GrpcAPI.NumberMessage reward = apiCli.getReward(ownerAddress);
      Response.Account account = queryAccount(ownerAddress);
      if (account.getAllowance() <= 0 && reward.getNum() <= 0) {
        System.out.println("witnessAccount does not have any reward");
        return false;
      }
      if (!isControlled(ownerAddress)) {
        return false;
      }
    }
    Response.TransactionExtention transactionExtention = apiCli.withdrawBalance(ownerAddress);
    return processTransactionExtention(transactionExtention, multi);
  }

  private WithdrawBalanceContract createWithdrawBalanceContract(byte[] address) {
    if (address == null) {
      address = getAddress();
    }

    WithdrawBalanceContract.Builder builder =
        WithdrawBalanceContract.newBuilder();
    ByteString byteAddreess = ByteString.copyFrom(address);
    builder.setOwnerAddress(byteAddreess);

    return builder.build();
  }

  public static Chain.Block getBlockById(String blockID) {
    return apiCli.getBlockById(blockID);
  }

  public static Response.BlockListExtention getBlockByLimitNext(long start, long end) throws IllegalException {
    try {
      return apiCli.getBlockByLimitNext(start, end);
    } catch (IllegalException e) {
      return Response.BlockListExtention.getDefaultInstance();
    }
  }

  public static Response.BlockListExtention getBlockByLimitNext2(long start, long end)
      throws IllegalException {
    try {
      return apiCli.getBlockByLimitNext(start, end);
    } catch (IllegalException e) {
      return Response.BlockListExtention.getDefaultInstance();
    }
  }

  public static Response.BlockListExtention getBlockByLatestNum2(long num) throws IllegalException {
    return apiCli.getBlockByLatestNum2(num);
  }

  public boolean createProposal(byte[] owner, HashMap<Long, Long> parametersMap, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (owner == null) {
      owner = getAddress();
    }

    Response.TransactionExtention transactionExtention = apiCli.proposalCreate(owner, parametersMap);
    return processTransactionExtention(transactionExtention, multi);
  }

  public static Response.ProposalList listProposals() {
    return apiCli.listProposals();
  }

  public static Response.Proposal getProposal(String id) {
    return apiCli.getProposal(id);
  }

  public static Response.DelegatedResourceList getDelegatedResource(
      String fromAddress, String toAddress) {
    return apiCli.getDelegatedResource(fromAddress, toAddress);
  }

  public static Response.DelegatedResourceAccountIndex getDelegatedResourceAccountIndex(
      String ownerAddress) {
    return apiCli.getDelegatedResourceAccountIndex(ownerAddress);
  }

  public static Response.DelegatedResourceList getDelegatedResourceV2(
      String fromAddress, String toAddress) {
    return apiCli.getDelegatedResourceV2(fromAddress, toAddress);
  }

  public static Response.DelegatedResourceAccountIndex getDelegatedResourceAccountIndexV2(
      String ownerAddress) throws IllegalException {
    return apiCli.getDelegatedResourceAccountIndexV2(ownerAddress);
  }

  public static long getCanWithdrawUnfreezeAmount(
      byte[] ownerAddress, long timestamp) {
    return apiCli.getCanWithdrawUnfreezeAmount(ownerAddress, timestamp);
  }

  public static long getCanDelegatedMaxSize(byte[] ownerAddress, int type) {
    return apiCli.getCanDelegatedMaxSize(ownerAddress, type);
  }

  public static long getAvailableUnfreezeCount(byte[] ownerAddress) {
    return apiCli.getAvailableUnfreezeCount(ownerAddress);
  }

  public static Response.ExchangeList listExchanges() {
    return apiCli.listExchanges();
  }

  public static Response.Exchange getExchange(String id) throws IllegalException {
    return apiCli.getExchange(id);
  }

  public static Response.ChainParameters getChainParameters() throws IllegalException {
    return apiCli.getChainParameters();
  }

  public static ProposalCreateContract createProposalCreateContract(
      byte[] owner, HashMap<Long, Long> parametersMap) {
    ProposalCreateContract.Builder builder = ProposalCreateContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.putAllParameters(parametersMap);
    return builder.build();
  }

  public boolean approveProposal(byte[] owner, long id,
                                 boolean isAddApproval, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }

    Response.TransactionExtention transactionExtention = apiCli.approveProposal(owner, id, isAddApproval);
    return processTransactionExtention(transactionExtention, multi);
  }

  public static ProposalApproveContract createProposalApproveContract(
      byte[] owner, long id, boolean is_add_approval) {
    ProposalApproveContract.Builder builder =
        ProposalApproveContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setProposalId(id);
    builder.setIsAddApproval(is_add_approval);
    return builder.build();
  }

  public boolean deleteProposal(byte[] owner, long id, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }

    Response.TransactionExtention transactionExtention = apiCli.deleteProposal(owner, id);
    return processTransactionExtention(transactionExtention, multi);
  }

  public static ProposalDeleteContract createProposalDeleteContract(byte[] owner, long id) {
    ProposalDeleteContract.Builder builder = ProposalDeleteContract
        .newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setProposalId(id);
    return builder.build();
  }

  public boolean exchangeCreate(
      byte[] owner,
      byte[] firstTokenId,
      long firstTokenBalance,
      byte[] secondTokenId,
      long secondTokenBalance, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }

    Response.TransactionExtention transactionExtention = apiCli.exchangeCreate(owner, firstTokenId, firstTokenBalance, secondTokenId, secondTokenBalance);
    return processTransactionExtention(transactionExtention, multi);
  }


  public static ExchangeCreateContract createExchangeCreateContract(
      byte[] owner,
      byte[] firstTokenId,
      long firstTokenBalance,
      byte[] secondTokenId,
      long secondTokenBalance) {
    ExchangeCreateContract.Builder builder = ExchangeCreateContract
        .newBuilder();
    builder
        .setOwnerAddress(ByteString.copyFrom(owner))
        .setFirstTokenId(ByteString.copyFrom(firstTokenId))
        .setFirstTokenBalance(firstTokenBalance)
        .setSecondTokenId(ByteString.copyFrom(secondTokenId))
        .setSecondTokenBalance(secondTokenBalance);
    return builder.build();
  }

  public boolean exchangeInject(byte[] owner, long exchangeId,
                                byte[] tokenId, long quant, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }

    Response.TransactionExtention transactionExtention = apiCli.exchangeInject(owner, exchangeId, tokenId, quant);
    return processTransactionExtention(transactionExtention, multi);
  }

  public static ExchangeInjectContract createExchangeInjectContract(
      byte[] owner, long exchangeId, byte[] tokenId, long quant) {
    ExchangeInjectContract.Builder builder = ExchangeInjectContract
        .newBuilder();
    builder
        .setOwnerAddress(ByteString.copyFrom(owner))
        .setExchangeId(exchangeId)
        .setTokenId(ByteString.copyFrom(tokenId))
        .setQuant(quant);
    return builder.build();
  }

  public boolean exchangeWithdraw(byte[] owner, long exchangeId,
                                  byte[] tokenId, long quant, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }

    Response.TransactionExtention transactionExtention = apiCli.exchangeWithdraw(owner, exchangeId, tokenId, quant);
    return processTransactionExtention(transactionExtention, multi);
  }


  public static ExchangeWithdrawContract createExchangeWithdrawContract(
      byte[] owner, long exchangeId, byte[] tokenId, long quant) {
    ExchangeWithdrawContract.Builder builder = ExchangeWithdrawContract.newBuilder();
    builder
        .setOwnerAddress(ByteString.copyFrom(owner))
        .setExchangeId(exchangeId)
        .setTokenId(ByteString.copyFrom(tokenId))
        .setQuant(quant);
    return builder.build();
  }

  public boolean exchangeTransaction(byte[] owner, long exchangeId, byte[] tokenId, long quant,
                                     long expected, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }

    Response.TransactionExtention transactionExtention = apiCli.exchangeTransaction(owner, exchangeId, tokenId, quant, expected);
    return processTransactionExtention(transactionExtention, multi);
  }

  public static ExchangeTransactionContract createExchangeTransactionContract(
      byte[] owner, long exchangeId, byte[] tokenId, long quant, long expected) {
    ExchangeTransactionContract.Builder builder = ExchangeTransactionContract.newBuilder();
    builder
        .setOwnerAddress(ByteString.copyFrom(owner))
        .setExchangeId(exchangeId)
        .setTokenId(ByteString.copyFrom(tokenId))
        .setQuant(quant)
        .setExpected(expected);
    return builder.build();
  }

  public static SmartContract.ABI.Entry.EntryType getEntryType(String type) {
    switch (type) {
      case "constructor":
        return SmartContract.ABI.Entry.EntryType.Constructor;
      case "function":
        return SmartContract.ABI.Entry.EntryType.Function;
      case "event":
        return SmartContract.ABI.Entry.EntryType.Event;
      case "fallback":
        return SmartContract.ABI.Entry.EntryType.Fallback;
      case "receive":
        return SmartContract.ABI.Entry.EntryType.Receive;
      case "error":
        return SmartContract.ABI.Entry.EntryType.Error;
      default:
        return SmartContract.ABI.Entry.EntryType.UnknownEntryType;
    }
  }

  public static SmartContract.ABI.Entry.StateMutabilityType getStateMutability(
      String stateMutability) {
    switch (stateMutability) {
      case "pure":
        return SmartContract.ABI.Entry.StateMutabilityType.Pure;
      case "view":
        return SmartContract.ABI.Entry.StateMutabilityType.View;
      case "nonpayable":
        return SmartContract.ABI.Entry.StateMutabilityType.Nonpayable;
      case "payable":
        return SmartContract.ABI.Entry.StateMutabilityType.Payable;
      default:
        return SmartContract.ABI.Entry.StateMutabilityType.UnknownMutabilityType;
    }
  }

  public static SmartContract.ABI jsonStr2ABI(String jsonStr) {
    if (jsonStr == null) {
      return null;
    }

    JsonParser jsonParser = new JsonParser();
    JsonElement jsonElementRoot = jsonParser.parse(jsonStr);
    JsonArray jsonRoot = jsonElementRoot.getAsJsonArray();
    SmartContract.ABI.Builder abiBuilder = SmartContract.ABI.newBuilder();
    for (int index = 0; index < jsonRoot.size(); index++) {
      JsonElement abiItem = jsonRoot.get(index);
      boolean anonymous =
          abiItem.getAsJsonObject().get("anonymous") != null
              ? abiItem.getAsJsonObject().get("anonymous")
              .getAsBoolean()
              : false;
      boolean constant =
          abiItem.getAsJsonObject().get("constant") != null
              ? abiItem.getAsJsonObject().get("constant")
              .getAsBoolean()
              : false;
      String name =
          abiItem.getAsJsonObject().get("name") != null
              ? abiItem.getAsJsonObject().get("name").getAsString()
              : null;
      JsonArray inputs =
          abiItem.getAsJsonObject().get("inputs") != null
              ? abiItem.getAsJsonObject().get("inputs")
              .getAsJsonArray()
              : null;
      JsonArray outputs =
          abiItem.getAsJsonObject().get("outputs") != null
              ? abiItem.getAsJsonObject().get("outputs")
              .getAsJsonArray()
              : null;
      String type =
          abiItem.getAsJsonObject().get("type") != null
              ? abiItem.getAsJsonObject().get("type").getAsString()
              : null;
      boolean payable =
          abiItem.getAsJsonObject().get("payable") != null
              ? abiItem.getAsJsonObject().get("payable")
              .getAsBoolean()
              : false;
      String stateMutability =
          abiItem.getAsJsonObject().get("stateMutability") != null
              ? abiItem.getAsJsonObject().get("stateMutability")
              .getAsString()
              : null;
      if (type == null) {
        System.out.println("No type!");
        return null;
      }
      if (inputs == null) {
        if (!(type.equalsIgnoreCase("fallback") || type.equalsIgnoreCase("receive"))) {
          logger.error("No inputs!");
          return null;
        }
      }
      SmartContract.ABI.Entry.Builder entryBuilder = SmartContract.ABI.Entry.newBuilder();
      entryBuilder.setAnonymous(anonymous);
      entryBuilder.setConstant(constant);
      if (name != null) {
        entryBuilder.setName(name);
      }

      /* { inputs : optional } since fallback function not requires inputs*/
      if (null != inputs) {
        for (int j = 0; j < inputs.size(); j++) {
          JsonElement inputItem = inputs.get(j);
          if (inputItem.getAsJsonObject().get("name") == null
              || inputItem.getAsJsonObject().get("type") == null) {
            System.out.println("Input argument invalid due to no name or no type!");
            return null;
          }
          String inputName = inputItem.getAsJsonObject().get("name").getAsString();
          String inputType = inputItem.getAsJsonObject().get("type").getAsString();
          Boolean inputIndexed = false;
          if (inputItem.getAsJsonObject().get("indexed") != null) {
            inputIndexed =
                Boolean.valueOf(
                    inputItem.getAsJsonObject().get("indexed")
                        .getAsString());
          }
          SmartContract.ABI.Entry.Param.Builder paramBuilder =
              SmartContract.ABI.Entry.Param.newBuilder();
          paramBuilder.setIndexed(inputIndexed);
          paramBuilder.setName(inputName);
          paramBuilder.setType(inputType);
          entryBuilder.addInputs(paramBuilder.build());
        }
      }

      /* { outputs : optional } */
      if (outputs != null) {
        for (int k = 0; k < outputs.size(); k++) {
          JsonElement outputItem = outputs.get(k);
          if (outputItem.getAsJsonObject().get("name") == null
              || outputItem.getAsJsonObject().get("type") == null) {
            System.out.println("Output argument invalid due to no name or no type!");
            return null;
          }
          String outputName = outputItem.getAsJsonObject().get("name").getAsString();
          String outputType = outputItem.getAsJsonObject().get("type").getAsString();
          Boolean outputIndexed = false;
          if (outputItem.getAsJsonObject().get("indexed") != null) {
            outputIndexed =
                Boolean.valueOf(
                    outputItem.getAsJsonObject().get("indexed")
                        .getAsString());
          }
          SmartContract.ABI.Entry.Param.Builder paramBuilder =
              SmartContract.ABI.Entry.Param.newBuilder();
          paramBuilder.setIndexed(outputIndexed);
          paramBuilder.setName(outputName);
          paramBuilder.setType(outputType);
          entryBuilder.addOutputs(paramBuilder.build());
        }
      }

      entryBuilder.setType(getEntryType(type));
      entryBuilder.setPayable(payable);
      if (stateMutability != null) {
        entryBuilder.setStateMutability(
            getStateMutability(stateMutability));
      }

      abiBuilder.addEntrys(entryBuilder.build());
    }

    return abiBuilder.build();
  }

  public static UpdateSettingContract createUpdateSettingContract(
      byte[] owner, byte[] contractAddress, long consumeUserResourcePercent) {

    UpdateSettingContract.Builder builder = UpdateSettingContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setContractAddress(ByteString.copyFrom(contractAddress));
    builder.setConsumeUserResourcePercent(consumeUserResourcePercent);
    return builder.build();
  }

  public static UpdateEnergyLimitContract createUpdateEnergyLimitContract(
      byte[] owner, byte[] contractAddress, long originEnergyLimit) {

    UpdateEnergyLimitContract.Builder builder = UpdateEnergyLimitContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setContractAddress(ByteString.copyFrom(contractAddress));
    builder.setOriginEnergyLimit(originEnergyLimit);
    return builder.build();
  }

  public static ClearABIContract createClearABIContract(byte[] owner, byte[] contractAddress) {

    ClearABIContract.Builder builder = ClearABIContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    builder.setContractAddress(ByteString.copyFrom(contractAddress));
    return builder.build();
  }

  public static CreateSmartContract createContractDeployContract(
      String contractName,
      byte[] address,
      String ABI,
      String code,
      long value,
      long consumeUserResourcePercent,
      long originEnergyLimit,
      long tokenValue,
      String tokenId,
      String libraryAddressPair,
      String compilerVersion) {
    SmartContract.ABI abi = jsonStr2ABI(ABI);
    if (abi == null) {
      System.out.println("abi is null");
      return null;
    }

    SmartContract.Builder builder = SmartContract.newBuilder();
    builder.setName(contractName);
    builder.setOriginAddress(ByteString.copyFrom(address));
    builder.setAbi(abi);
    builder
        .setConsumeUserResourcePercent(consumeUserResourcePercent)
        .setOriginEnergyLimit(originEnergyLimit);

    if (value != 0) {

      builder.setCallValue(value);
    }
    byte[] byteCode;
    if (null != libraryAddressPair) {
      byteCode = replaceLibraryAddress(code, libraryAddressPair, compilerVersion);
    } else {
      byteCode = Hex.decode(code);
    }

    builder.setBytecode(ByteString.copyFrom(byteCode));
    CreateSmartContract.Builder createSmartContractBuilder = CreateSmartContract.newBuilder();
    createSmartContractBuilder
        .setOwnerAddress(ByteString.copyFrom(address))
        .setNewContract(builder.build());
    if (tokenId != null && !tokenId.equalsIgnoreCase("") && !tokenId.equalsIgnoreCase("#")) {
      createSmartContractBuilder.setCallTokenValue(tokenValue).setTokenId(Long.parseLong(tokenId));
    }
    return createSmartContractBuilder.build();
  }

  private static byte[] replaceLibraryAddress(String code, String libraryAddressPair,
                                              String compilerVersion) {

    String[] libraryAddressList = libraryAddressPair.split("[,]");

    for (int i = 0; i < libraryAddressList.length; i++) {
      String cur = libraryAddressList[i];

      int lastPosition = cur.lastIndexOf(":");
      if (-1 == lastPosition) {
        throw new RuntimeException("libraryAddress delimit by ':'");
      }
      String libraryName = cur.substring(0, lastPosition);
      String addr = cur.substring(lastPosition + 1);
      String libraryAddressHex;
      try {
        libraryAddressHex = (new String(Hex.encode(WalletApi.decodeFromBase58Check(addr)),
            "US-ASCII")).substring(2);
      } catch (UnsupportedEncodingException e) {
        throw new RuntimeException(e); // now ignore
      }

      String beReplaced;
      if (compilerVersion == null) {
        // old version
        String repeated = new String(
            new char[40 - libraryName.length() - 2])
            .replace("\0", "_");
        beReplaced = "__" + libraryName + repeated;
      } else if (compilerVersion.equalsIgnoreCase("v5")) {
        // 0.5.4 version
        String libraryNameKeccak256 =
            ByteArray.toHexString(
                    Hash.sha3(ByteArray.fromString(libraryName)))
                .substring(0, 34);
        beReplaced = "__\\$" + libraryNameKeccak256 + "\\$__";
      } else {
        throw new RuntimeException("unknown compiler version.");
      }

      Matcher m = Pattern.compile(beReplaced).matcher(code);
      code = m.replaceAll(libraryAddressHex);
    }

    return Hex.decode(code);
  }

  public static TriggerSmartContract triggerCallContract(
      byte[] address,
      byte[] contractAddress,
      long callValue,
      byte[] data,
      long tokenValue,
      String tokenId) {
    TriggerSmartContract.Builder builder = TriggerSmartContract.newBuilder();
    builder.setOwnerAddress(ByteString.copyFrom(address));
    if (contractAddress != null) {
      builder.setContractAddress(ByteString.copyFrom(contractAddress));
    }
    builder.setData(ByteString.copyFrom(data));
    builder.setCallValue(callValue);
    if (tokenId != null && tokenId != "") {
      builder.setCallTokenValue(tokenValue);
      builder.setTokenId(Long.parseLong(tokenId));
    }
    return builder.build();
  }

  public byte[] generateContractAddress(byte[] ownerAddress, Chain.Transaction trx) {
    // get tx hash
    byte[] txRawDataHash = Sha256Sm3Hash.of(trx.getRawData().toByteArray()).getBytes();

    // combine
    byte[] combined = new byte[txRawDataHash.length + ownerAddress.length];
    System.arraycopy(txRawDataHash, 0, combined, 0, txRawDataHash.length);
    System.arraycopy(ownerAddress, 0, combined, txRawDataHash.length, ownerAddress.length);

    return Hash.sha3omit12(combined);
  }

  public boolean updateSetting(byte[] owner, byte[] contractAddress,
                               long consumeUserResourcePercent, boolean multi)
      throws IOException, CipherException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }

    Response.TransactionExtention transactionExtention = apiCli.updateSetting(owner, contractAddress, consumeUserResourcePercent);
    if (transactionExtention == null || !transactionExtention.getResult().getResult()) {
      System.out.println("RPC create trx " + failedHighlight() + "!");
      if (transactionExtention != null) {
        System.out.println("Code = " + transactionExtention.getResult().getCode());
        System.out
            .println("Message = " + transactionExtention.getResult().getMessage().toStringUtf8());
      }
      return false;
    }

    return processTransactionExtention(
        transactionExtention, multi);
  }

  public boolean updateEnergyLimit(byte[] owner, byte[] contractAddress, long originEnergyLimit, boolean multi)
      throws IOException, CipherException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }

    Response.TransactionExtention transactionExtention = apiCli.updateEnergyLimit(owner, contractAddress, originEnergyLimit);
    if (transactionExtention == null || !transactionExtention.getResult().getResult()) {
      System.out.println("RPC create trx " + failedHighlight() + "!");
      if (transactionExtention != null) {
        System.out.println("Code = " + transactionExtention.getResult().getCode());
        System.out.println("Message = " + transactionExtention.getResult().getMessage()
            .toStringUtf8());
      }
      return false;
    }
    return processTransactionExtention(transactionExtention, multi);
  }

  public boolean clearContractABI(byte[] owner, byte[] contractAddress, boolean multi)
      throws IOException, CipherException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }

    Response.TransactionExtention transactionExtention = apiCli.clearContractABI(owner, contractAddress);
    if (transactionExtention == null || !transactionExtention.getResult().getResult()) {
      System.out.println("RPC create trx " + failedHighlight() + "!");
      if (transactionExtention != null) {
        System.out.println("Code = " + transactionExtention.getResult().getCode());
        System.out
            .println("Message = " + transactionExtention.getResult().getMessage().toStringUtf8());
      }
      return false;
    }

    return processTransactionExtention(transactionExtention, multi);
  }

  public boolean clearWalletKeystore() {
    String ownerAddress = WalletApi.encode58Check(getAddress());

    List<String> walletPath;
    try {
      walletPath = WalletUtils.getStoreFileNames(ownerAddress, "Wallet");
    } catch (Exception e) {
      System.err.println("Error retrieving wallet file names: " + e.getMessage());
      return false;
    }
    List<String> filePaths = new ArrayList<>(walletPath);

    List<String> mnemonicPath = WalletUtils.getStoreFileNames(ownerAddress, "Mnemonic");
    if (mnemonicPath != null && !mnemonicPath.isEmpty()) {
      filePaths.addAll(mnemonicPath);
    }

    if (this.isLedgerUser && this.path != null && !this.path.isEmpty()) {
      try {
        HidDevice matchedDevice = TronLedgerGetAddress.getInstance().getMatchedDevice(path, ownerAddress);
        LedgerFileUtil.removePathFromFile(this.path, matchedDevice);
      } catch (Exception e) {
        System.err.println("Error removing path from file: " + e.getMessage());
        return false;
      }
    }

    try {
      return ClearWalletUtils.confirmAndDeleteWallet(ownerAddress, filePaths);
    } catch (Exception e) {
      System.err.println("Error confirming and deleting wallet: " + e.getMessage());
      return false;
    }
  }

  public boolean deployContract(
      byte[] owner,
      String contractName,
      String ABI,
      String code,
      long feeLimit,
      long value,
      long consumeUserResourcePercent,
      long originEnergyLimit,
      long tokenValue,
      String tokenId,
      String libraryAddressPair,
      String compilerVersion, boolean multi)
      throws Exception {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }

    if (null != libraryAddressPair) {
      code = Hex.toHexString(replaceLibraryAddress(code, libraryAddressPair, compilerVersion));
    }
    ApiClient tmpApiCli;
    NetType netType = getCurrentNetwork();
    byte[] bytes = isUnifiedExist() ? getUnifiedPassword() : getPwdForDeploy();
    String privateKey = ByteArray.toHexString(credentials == null ? decrypt2PrivateBytes(bytes, getWalletFile()) : credentials.getPair().getPrivateKey());
    if (netType == CUSTOM) {
      tmpApiCli = new ApiClient(customNodes.getLeft().getLeft(), customNodes.getRight().getLeft(),
          customNodes.getLeft().getRight(), customNodes.getRight().getRight(), privateKey);
    } else {
      tmpApiCli = new ApiClient(netType, privateKey);
    }
    Response.TransactionExtention transactionExtention = tmpApiCli.deployContract(contractName, ABI,
        code, Collections.emptyList(), feeLimit, consumeUserResourcePercent, originEnergyLimit,
        value, tokenId, tokenValue);
    tmpApiCli.close();
    if (transactionExtention == null || !transactionExtention.getResult().getResult()) {
      System.out.println("RPC create trx " + failedHighlight() + "!");
      if (transactionExtention != null) {
        System.out.println("Code = " + transactionExtention.getResult().getCode());
        System.out
            .println("Message = " + transactionExtention.getResult().getMessage().toStringUtf8());
      }
      return false;
    }

    Response.TransactionExtention.Builder texBuilder = Response.TransactionExtention.newBuilder();
    Chain.Transaction.Builder transBuilder = Chain.Transaction.newBuilder();
    Chain.Transaction.raw.Builder rawBuilder = transactionExtention.getTransaction().getRawData()
        .toBuilder();
    rawBuilder.setFeeLimit(feeLimit);
    transBuilder.setRawData(rawBuilder);
    for (int i = 0; i < transactionExtention.getTransaction().getSignatureCount(); i++) {
      ByteString s = transactionExtention.getTransaction().getSignature(i);
      transBuilder.setSignature(i, s);
    }
    for (int i = 0; i < transactionExtention.getTransaction().getRetCount(); i++) {
      Chain.Transaction.Result r = transactionExtention.getTransaction().getRet(i);
      transBuilder.setRet(i, r);
    }
    texBuilder.setTransaction(transBuilder);
    texBuilder.setResult(transactionExtention.getResult());
    texBuilder.setTxid(transactionExtention.getTxid());
    transactionExtention = texBuilder.build();

    return processTransactionExtention(transactionExtention, multi);
  }

  public Triple<Boolean, Long, Long> triggerContract(
      byte[] owner,
      byte[] contractAddress,
      long callValue,
      byte[] data,
      long feeLimit,
      long tokenValue,
      String tokenId,
      boolean isConstant,
      boolean noExe,
      boolean display, boolean multi)
      throws Exception {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (owner == null) {
      owner = getAddress();
    }
    if (multi) {
      if (!DecodeUtil.addressValid(owner)) {
        System.out.println("Invalid ownerAddress!");
        return Triple.of(false, 0L, 0L);
      }
      if (!isControlled(owner)) {
        return Triple.of(false, 0L, 0L);
      }
    }
    Response.TransactionExtention transactionExtention;
    if (isConstant) {
      transactionExtention = apiCli.triggerConstantContract(owner, contractAddress, data, callValue, tokenValue, tokenId);
    } else {
      transactionExtention = apiCli.triggerContract(owner, contractAddress, data, callValue, tokenValue, tokenId, feeLimit);
    }

    if (transactionExtention == null || !transactionExtention.getResult().getResult()) {
      System.out.println("RPC create call trx" + failedHighlight() + "!");
      System.out.println("Code = " + transactionExtention.getResult().getCode());
      System.out
          .println("Message = " + transactionExtention.getResult().getMessage().toStringUtf8());
      return Triple.of(false, 0L, 0L);
    }

    Chain.Transaction transaction = transactionExtention
        .getTransaction();
    // for constant
    if (transaction.getRetCount() != 0) {
      Response.TransactionExtention.Builder builder =
          transactionExtention.toBuilder().clearTransaction().clearTxid();
      if (transaction.getRet(0).getRet() == Chain.Transaction.Result.code.FAILED) {
        builder.setResult(builder.getResult().toBuilder().setResult(false));
      }
      long energyUsed = builder.build().getEnergyUsed();
      if (!noExe) {
        if (display) {
          long calculateBandwidth = calculateBandwidth(transaction);
          String s = new String(builder.build().getResult().getMessage().toByteArray(), StandardCharsets.UTF_8);
          if ("REVERT opcode executed".equals(s)) {
            System.out.println(redBoldHighlight("The transaction may be reverted."));
          }
          System.out.println("It is estimated that " + greenBoldHighlight(calculateBandwidth) + " bandwidth and " + greenBoldHighlight(energyUsed) + " energy will be consumed.");
        } else {
          System.out.println("Execution result = " + Utils.formatMessageString(builder.build()));
        }
      }
      BigInteger bigInteger = BigInteger.valueOf(0L);
      if (builder.getConstantResultCount() == 1) {
        ByteString constantResult = builder.getConstantResult(0);
        bigInteger = new BigInteger(1, constantResult.toByteArray());
      }
      return Triple.of(true, energyUsed, bigInteger.longValue());
    }

    Response.TransactionExtention.Builder texBuilder = Response.TransactionExtention.newBuilder();
    Chain.Transaction.Builder transBuilder = Chain.Transaction.newBuilder();
    Chain.Transaction.raw.Builder rawBuilder = transactionExtention.getTransaction().getRawData()
        .toBuilder();
    rawBuilder.setFeeLimit(feeLimit);
    transBuilder.setRawData(rawBuilder);
    for (int i = 0; i < transactionExtention.getTransaction().getSignatureCount(); i++) {
      ByteString s = transactionExtention.getTransaction().getSignature(i);
      transBuilder.setSignature(i, s);
    }
    for (int i = 0; i < transactionExtention.getTransaction().getRetCount(); i++) {
      Chain.Transaction.Result r = transactionExtention.getTransaction().getRet(i);
      transBuilder.setRet(i, r);
    }
    texBuilder.setTransaction(transBuilder);
    texBuilder.setResult(transactionExtention.getResult());
    texBuilder.setTxid(transactionExtention.getTxid());
    transactionExtention = texBuilder.build();

    return Triple.of(processTransactionExtention(transactionExtention, multi), 0L, 0L);
  }

  public static long calculateBandwidth(Chain.Transaction transaction) {
    String hexString = Hex.toHexString(transaction.getRawData().toByteArray());
    final long DATA_HEX_PROTOBUF_EXTRA = 9;
    final long SIGNATURE_PER_BANDWIDTH = 67;
    final long MAX_RESULT_SIZE_IN_TX = 64;
    long byteLength = (long) Math.ceil(hexString.length() / 2.0);
    long bandwidthBuffer = DATA_HEX_PROTOBUF_EXTRA
        + SIGNATURE_PER_BANDWIDTH * (transaction.getSignatureCount() + 1)
        + MAX_RESULT_SIZE_IN_TX;

    return byteLength + bandwidthBuffer;
  }

  public boolean estimateEnergy(
      byte[] owner,
      byte[] contractAddress,
      long callValue,
      byte[] data,
      long tokenValue,
      String tokenId)
      throws IOException, CipherException, CancelException {
    if (owner == null) {
      owner = getAddress();
    }

    Response.EstimateEnergyMessage estimateEnergyMessage = apiCli.estimateEnergy(owner,
        contractAddress, callValue, data, tokenValue, tokenId);

    if (estimateEnergyMessage == null) {
      System.out.println("RPC create call trx " + failedHighlight() + "!");
      return false;
    }

    if (!estimateEnergyMessage.getResult().getResult()) {
      System.out.println("RPC estimate energy " + failedHighlight() + "!");
      System.out.println("Code = " + estimateEnergyMessage.getResult().getCode());
      System.out
          .println("Message = " + estimateEnergyMessage.getResult().getMessage().toStringUtf8());
      return false;
    }
    System.out.println("Estimate energy result = " + Utils.formatMessageString(estimateEnergyMessage));
    return true;
  }

  public static Common.SmartContract getContract(byte[] address) {
    return apiCli.getContract(address);
  }

  public static Response.SmartContractDataWrapper getContractInfo(byte[] address) {
    return apiCli.getContractInfo(address);
  }

  public boolean accountPermissionUpdate(byte[] owner, String permissionJson, boolean multi)
      throws CipherException, IOException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    Contract.AccountPermissionUpdateContract contract =
        createAccountPermissionContract(owner, permissionJson);
    Response.TransactionExtention transactionExtention = apiCli.accountPermissionUpdate(contract);
    return processTransactionExtention(transactionExtention, multi);
  }

  private Common.Permission json2Permission(JSONObject json) {
    Common.Permission.Builder permissionBuilder = Common.Permission.newBuilder();
    if (json.containsKey("type")) {
      int type = json.getInteger("type");
      permissionBuilder.setTypeValue(type);
    }
    if (json.containsKey("permission_name")) {
      String permission_name = json.getString("permission_name");
      permissionBuilder.setPermissionName(permission_name);
    }
    if (json.containsKey("threshold")) {
      long threshold = json.getLong("threshold");
      permissionBuilder.setThreshold(threshold);
    }
    if (json.containsKey("parent_id")) {
      int parent_id = json.getInteger("parent_id");
      permissionBuilder.setParentId(parent_id);
    }
    if (json.containsKey("operations")) {
      byte[] operations = ByteArray.fromHexString(json.getString("operations"));
      permissionBuilder.setOperations(ByteString.copyFrom(operations));
    }
    if (json.containsKey("keys")) {
      JSONArray keys = json.getJSONArray("keys");
      List<Common.Key> keyList = new ArrayList<>();
      for (int i = 0; i < keys.size(); i++) {
        Common.Key.Builder keyBuilder = Common.Key.newBuilder();
        JSONObject key = keys.getJSONObject(i);
        String address = key.getString("address");
        long weight = key.getLong("weight");
        keyBuilder.setAddress(ByteString.copyFrom(WalletApi.decode58Check(address)));
        keyBuilder.setWeight(weight);
        keyList.add(keyBuilder.build());
      }
      permissionBuilder.addAllKeys(keyList);
    }
    return permissionBuilder.build();
  }

  public Contract.AccountPermissionUpdateContract createAccountPermissionContract(byte[] owner,
                                                                                  String permissionJson) {
    Contract.AccountPermissionUpdateContract.Builder builder = Contract.AccountPermissionUpdateContract.newBuilder();

    JSONObject permissions = JSON.parseObject(permissionJson);
    JSONObject op = permissions.getJSONObject("owner_permission");
    JSONObject wp = permissions.getJSONObject("witness_permission");
    JSONArray ap = permissions.getJSONArray("active_permissions");

    if (op != null) {
      Common.Permission ownerPermission = json2Permission(op);
      builder.setOwner(ownerPermission);
    }
    if (wp != null) {
      Common.Permission witnessPermission = json2Permission(wp);
      builder.setWitness(witnessPermission);
    }
    if (ap != null) {
      List<Common.Permission> activePermissionList = new ArrayList<>();
      for (int j = 0; j < ap.size(); j++) {
        JSONObject permission = ap.getJSONObject(j);
        activePermissionList.add(json2Permission(permission));
      }
      builder.addAllActives(activePermissionList);
    }
    builder.setOwnerAddress(ByteString.copyFrom(owner));
    return builder.build();
  }

  public Chain.Transaction addTransactionSign(Chain.Transaction transaction)
      throws CipherException, IOException, CancelException {
    if (!isUnlocked()) {
      throw new IllegalStateException(LOCK_WARNING);
    }
    if (transaction.getRawData().getTimestamp() == 0) {
      transaction = TransactionUtils.setTimestamp(transaction);
    }
    transaction = TransactionUtils.setExpirationTime(transaction, false);
    String tipsString = "Please input permission id.";
    transaction = TransactionUtils.setPermissionId(transaction, tipsString);

    System.out.println("Please choose your key for sign.");
    WalletFile wf = selectWalletFileE();
    byte[] passwd;
    if (lockAccount && isUnifiedExist() && Arrays.equals(decodeFromBase58Check(wf.getAddress()), getAddress())) {
      passwd = getUnifiedPassword();
    } else {
      System.out.println("Please input your password.");
      passwd = char2Byte(inputPassword(false));
    }
    if (isEckey) {
      transaction = TransactionUtils.sign(transaction, this.getEcKey(wf, passwd));
    } else {
      transaction = TransactionUtils.sign(transaction, this.getSM2(wf, passwd));
    }
    return transaction;
  }

  public boolean updateBrokerage(byte[] owner, int brokerage, boolean multi)
      throws IOException, CipherException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException("Wallet is locked. Cannot sign or send transaction.");
    }
    if (owner == null) {
      owner = getAddress();
    }

    Response.TransactionExtention transactionExtention = apiCli.updateBrokerage(owner, brokerage);
    if (transactionExtention == null || !transactionExtention.getResult().getResult()) {
      System.out.println("RPC create trx " + failedHighlight() + "!");
      if (transactionExtention != null) {
        System.out.println("Code = " + transactionExtention.getResult().getCode());
        System.out.println(
            "Message = " + transactionExtention.getResult().getMessage().toStringUtf8());
      }
      return false;
    }

    return processTransactionExtention(transactionExtention, multi);
  }

  public static org.tron.trident.api.GrpcAPI.NumberMessage getReward(byte[] owner) {
    return apiCli.getReward(owner);
  }

  public static long getBrokerage(byte[] owner) {
    return apiCli.getBrokerage(owner);
  }

  public static Response.PricesResponseMessage getBandwidthPrices() {
    return apiCli.getBandwidthPrices();
  }

  public static Response.PricesResponseMessage getEnergyPrices() {
    return apiCli.getEnergyPrices();
  }

  public static Response.PricesResponseMessage getMemoFee() {
    return apiCli.getMemoFee();
  }

  public static Response.TransactionInfoList getTransactionInfoByBlockNum(long blockNum) throws IllegalException {
    return apiCli.getTransactionInfoByBlockNum(blockNum);
  }

  public boolean marketSellAsset(
      byte[] owner,
      byte[] sellTokenId,
      long sellTokenQuantity,
      byte[] buyTokenId,
      long buyTokenQuantity, boolean multi)
      throws IOException, CipherException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException("Wallet is locked. Cannot sign or send transaction.");
    }
    if (owner == null) {
      owner = getAddress();
    }

    Response.TransactionExtention transactionExtention = apiCli.marketSellAsset(owner, sellTokenId,
        sellTokenQuantity, buyTokenId, buyTokenQuantity);
    return processTransactionExtention(transactionExtention, multi);
  }

  public boolean marketCancelOrder(byte[] owner, byte[] orderId, boolean multi)
      throws IOException, CipherException, CancelException, IllegalException {
    if (!isUnlocked()) {
      throw new IllegalStateException("Wallet is locked. Cannot sign or send transaction.");
    }
    if (owner == null) {
      owner = getAddress();
    }

    Response.TransactionExtention transactionExtention = apiCli.marketCancelOrder(owner, orderId);
    return processTransactionExtention(transactionExtention, multi);
  }

  public static Response.MarketOrderList getMarketOrderByAccount(byte[] address) {
    return apiCli.getMarketOrderByAccount(address);
  }

  public static Response.MarketPriceList getMarketPriceByPair(
      byte[] sellTokenId, byte[] buyTokenId) {
    return apiCli.getMarketPriceByPair(sellTokenId, buyTokenId);
  }

  public static Response.MarketOrderList getMarketOrderListByPair(
      byte[] sellTokenId, byte[] buyTokenId) {
    return apiCli.getMarketOrderListByPair(sellTokenId, buyTokenId);
  }

  public static Response.MarketOrderPairList getMarketPairList() {
    return apiCli.getMarketPairList();
  }

  public static Response.MarketOrder getMarketOrderById(byte[] order) {
    return apiCli.getMarketOrderById(order);
  }

  public static Response.BlockExtention getBlock(String idOrNum, boolean detail) {
    if (idOrNum == null) {
      idOrNum = EMPTY;
    }
    return apiCli.getBlock(idOrNum, detail);
  }

  public static boolean isLockAccount() {
    return lockAccount;
  }

  public boolean unlock(byte[] password, long durationSeconds) throws IOException {
    File keyStoreFile = getWalletFile().getSourceFile();
    if (keyStoreFile == null) {
      throw new IOException(
          "No keystore file found, please use " + greenBoldHighlight("RegisterWallet") + " or " + greenBoldHighlight("ImportWallet") + " first!");
    }
    if (autoLockFuture != null && !autoLockFuture.isDone()) {
      autoLockFuture.cancel(false);
    }
    try {
      credentials = WalletUtils.loadCredentials(password, keyStoreFile);
    } catch (Exception e) {
      return false;
    }
    setCredentials(credentials);
    scheduleAutoLock(durationSeconds);
    return true;
  }

  public void lock() {
    credentials = null;
  }

  public boolean isUnlocked() {
    if (lockAccount) {
      return credentials != null;
    }
    return true;
  }

  private void scheduleAutoLock(long durationSeconds) {
    if (durationSeconds == 0) {
      return;
    }
    autoLockFuture = scheduler.schedule(() -> {
      try {
        lock();
        System.out.println("🔒 Auto-locked account.");
      } catch (Exception e) {
        System.err.println("⚠️ Auto-lock failed: " + e.getMessage());
      }
    }, durationSeconds, TimeUnit.SECONDS);
  }

  public void cleanup() {
    scheduler.shutdown();
  }

  public boolean modifyWalletName(String newName) throws IOException {
    WalletFile wf = getWalletFile();
    String originalName = wf.getName();
    if (originalName != null && originalName.startsWith("Ledger-") &&
        !newName.startsWith("Ledger-")) {
      newName = "Ledger-" + newName;
    }
    wf.setName(newName);
    String keystoreName = WalletApi.store2Keystore(wf);
    return StringUtils.isNotEmpty(keystoreName);
  }

  public void tronlinkMultiSign() {
    multiSignService.runCLI(encode58Check(getAddress()), this);
  }
}
