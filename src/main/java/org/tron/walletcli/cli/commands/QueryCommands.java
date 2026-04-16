package org.tron.walletcli.cli.commands;

import com.alibaba.fastjson.JSON;
import org.tron.walletcli.cli.CommandDefinition;
import org.tron.walletcli.cli.CommandRegistry;
import org.tron.walletcli.cli.OptionDef;
import org.tron.walletserver.WalletApi;
import org.tron.trident.proto.Chain;
import org.tron.trident.proto.Common;
import org.tron.trident.proto.Contract;
import org.tron.trident.proto.Response;
import org.tron.common.utils.Utils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Map;

public class QueryCommands {

    private static CommandDefinition.Builder noAuthCommand() {
        return CommandDefinition.builder().authPolicy(CommandDefinition.AuthPolicy.NEVER);
    }

    public static void register(CommandRegistry registry) {
        registerGetAddress(registry);
        registerGetBalance(registry);
        registerGetAccount(registry);
        registerGetAccountById(registry);
        registerGetAccountNet(registry);
        registerGetAccountResource(registry);
        registerGetUsdtBalance(registry);
        registerCurrentNetwork(registry);
        registerGetBlock(registry);
        registerGetBlockById(registry);
        registerGetBlockByIdOrNum(registry);
        registerGetBlockByLatestNum(registry);
        registerGetBlockByLimitNext(registry);
        registerGetTransactionById(registry);
        registerGetTransactionInfoById(registry);
        registerGetTransactionCountByBlockNum(registry);
        registerGetAssetIssueByAccount(registry);
        registerGetAssetIssueById(registry);
        registerGetAssetIssueByName(registry);
        registerGetAssetIssueListByName(registry);
        registerGetChainParameters(registry);
        registerGetBandwidthPrices(registry);
        registerGetEnergyPrices(registry);
        registerGetMemoFee(registry);
        registerGetNextMaintenanceTime(registry);
        registerGetContract(registry);
        registerGetContractInfo(registry);
        registerGetDelegatedResource(registry);
        registerGetDelegatedResourceV2(registry);
        registerGetDelegatedResourceAccountIndex(registry);
        registerGetDelegatedResourceAccountIndexV2(registry);
        registerGetCanDelegatedMaxSize(registry);
        registerGetAvailableUnfreezeCount(registry);
        registerGetCanWithdrawUnfreezeAmount(registry);
        registerGetBrokerage(registry);
        registerGetReward(registry);
        registerListNodes(registry);
        registerListWitnesses(registry);
        registerListAssetIssue(registry);
        registerListAssetIssuePaginated(registry);
        registerListProposals(registry);
        registerListProposalsPaginated(registry);
        registerGetProposal(registry);
        registerListExchanges(registry);
        registerListExchangesPaginated(registry);
        registerGetExchange(registry);
        registerGetMarketOrderByAccount(registry);
        registerGetMarketOrderById(registry);
        registerGetMarketOrderListByPair(registry);
        registerGetMarketPairList(registry);
        registerGetMarketPriceByPair(registry);
        registerGasFreeInfo(registry);
        registerGasFreeTrace(registry);
    }

    private static void registerGetAddress(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicy(CommandDefinition.AuthPolicy.REQUIRE)
                .name("get-address")
                .aliases("getaddress")
                .description("Get the address of the current logged-in wallet")
                .handler((ctx, opts, wrapper, out) -> {
                    String address = wrapper.getAddress();
                    if (address != null) {
                        Map<String, Object> json = new LinkedHashMap<String, Object>();
                        json.put("address", address);
                        out.success("GetAddress successful !!\naddress = " + address, json);
                    } else {
                        out.error("not_logged_in", "GetAddress failed, please login first");
                    }
                })
                .build());
    }

    private static void registerGetBalance(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicyResolver(opts -> opts.has("address")
                        ? CommandDefinition.AuthPolicy.NEVER
                        : CommandDefinition.AuthPolicy.REQUIRE)
                .name("get-balance")
                .aliases("getbalance")
                .description("Get the balance of an address")
                .option("address", "Address to query (default: current wallet)", false)
                .handler((ctx, opts, wrapper, out) -> {
                    Response.Account account;
                    if (opts.has("address")) {
                        byte[] addressBytes = opts.getAddress("address");
                        account = WalletApi.queryAccount(addressBytes);
                    } else {
                        account = wrapper.queryAccount();
                    }
                    if (account == null) {
                        out.error("query_failed", "GetBalance failed");
                    } else {
                        long balance = account.getBalance();
                        BigDecimal trx = BigDecimal.valueOf(balance)
                                .divide(BigDecimal.valueOf(1_000_000), 6, RoundingMode.DOWN);
                        Map<String, Object> json = new LinkedHashMap<String, Object>();
                        json.put("balance_sun", balance);
                        json.put("balance_trx", trx.toPlainString());
                        out.success("Balance = " + balance + " SUN = " + trx.toPlainString() + " TRX", json);
                    }
                })
                .build());
    }

    private static void registerGetAccount(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-account")
                .aliases("getaccount")
                .description("Get account information by address")
                .option("address", "Address to query", true)
                .handler((ctx, opts, wrapper, out) -> {
                    byte[] addressBytes = opts.getAddress("address");
                    Response.Account account = WalletApi.queryAccount(addressBytes);
                    if (account == null) {
                        out.error("query_failed", "GetAccount failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(account), "GetAccount failed");
                    }
                })
                .build());
    }

    private static void registerGetAccountById(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-account-by-id")
                .aliases("getaccountbyid")
                .description("Get account information by account ID")
                .option("id", "Account ID", true)
                .handler((ctx, opts, wrapper, out) -> {
                    Response.Account account = WalletApi.queryAccountById(opts.getString("id"));
                    if (account == null) {
                        out.error("query_failed", "GetAccountById failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(account), "GetAccountById failed");
                    }
                })
                .build());
    }

    private static void registerGetAccountNet(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-account-net")
                .aliases("getaccountnet")
                .description("Get account net (bandwidth) information")
                .option("address", "Address to query", true)
                .handler((ctx, opts, wrapper, out) -> {
                    byte[] addressBytes = opts.getAddress("address");
                    Response.AccountNetMessage accountNet = wrapper.getAccountNetForCli(addressBytes);
                    out.printMessage(Utils.formatMessageString(accountNet), "GetAccountNet failed");
                })
                .build());
    }

    private static void registerGetAccountResource(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-account-resource")
                .aliases("getaccountresource")
                .description("Get account resource information")
                .option("address", "Address to query", true)
                .handler((ctx, opts, wrapper, out) -> {
                    byte[] addressBytes = opts.getAddress("address");
                    Response.AccountResourceMessage accountResource = wrapper.getAccountResourceForCli(addressBytes);
                    out.printMessage(Utils.formatMessageString(accountResource), "GetAccountResource failed");
                })
                .build());
    }

    private static void registerGetUsdtBalance(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicyResolver(opts -> opts.has("address")
                        ? CommandDefinition.AuthPolicy.NEVER
                        : CommandDefinition.AuthPolicy.REQUIRE)
                .name("get-usdt-balance")
                .aliases("getusdtbalance")
                .description("Get USDT balance of an address")
                .option("address", "Address to query (default: current wallet)", false)
                .handler((ctx, opts, wrapper, out) -> {
                    byte[] ownerAddress = opts.has("address") ? opts.getAddress("address") : null;
                    String balance = wrapper.getUSDTBalanceExact(ownerAddress);
                    if (balance != null) {
                        Map<String, Object> json = new LinkedHashMap<String, Object>();
                        json.put("usdt_balance", balance);
                        out.success("USDT balance = " + balance, json);
                    } else {
                        out.error("query_failed", "GetUSDTBalance failed");
                    }
                })
                .build());
    }

    private static void registerCurrentNetwork(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("current-network")
                .aliases("currentnetwork")
                .description("Display the current network")
                .handler((ctx, opts, wrapper, out) -> {
                    String network = WalletApi.getCurrentNetwork() != null
                            ? WalletApi.getCurrentNetwork().name() : "unknown";
                    Map<String, Object> json = new LinkedHashMap<String, Object>();
                    json.put("network", network);
                    out.success("Current network: " + network, json);
                })
                .build());
    }

    private static void registerGetBlock(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-block")
                .aliases("getblock")
                .description("Get block by number or latest")
                .option("number", "Block number (default: latest)", false, OptionDef.Type.LONG)
                .handler((ctx, opts, wrapper, out) -> {
                    long blockNum = opts.has("number") ? opts.getLong("number") : -1;
                    Chain.Block block = WalletApi.getBlock(blockNum);
                    if (block == null) {
                        out.error("query_failed", "GetBlock failed");
                    } else {
                        out.printMessage(Utils.printBlock(block), "GetBlock failed");
                    }
                })
                .build());
    }

    private static void registerGetBlockById(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-block-by-id")
                .aliases("getblockbyid")
                .description("Get block by block ID (hash)")
                .option("id", "Block ID / hash", true)
                .handler((ctx, opts, wrapper, out) -> {
                    Chain.Block block = WalletApi.getBlockById(opts.getString("id"));
                    if (block == null) {
                        out.error("query_failed", "GetBlockById failed");
                    } else {
                        out.printMessage(Utils.printBlock(block), "GetBlockById failed");
                    }
                })
                .build());
    }

    private static void registerGetBlockByIdOrNum(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-block-by-id-or-num")
                .aliases("getblockbyidornum")
                .description("Get block by ID or number")
                .option("value", "Block ID or number", true)
                .handler((ctx, opts, wrapper, out) -> {
                    String value = opts.getString("value");
                    try {
                        long blockNum = Long.parseLong(value);
                        Chain.Block block = WalletApi.getBlock(blockNum);
                        if (block == null) {
                            out.error("query_failed", "GetBlock failed");
                        } else {
                            out.printMessage(Utils.printBlock(block), "GetBlock failed");
                        }
                    } catch (NumberFormatException e) {
                        Chain.Block block = WalletApi.getBlockById(value);
                        if (block == null) {
                            out.error("query_failed", "GetBlockById failed");
                        } else {
                            out.printMessage(Utils.printBlock(block), "GetBlockById failed");
                        }
                    }
                })
                .build());
    }

    private static void registerGetBlockByLatestNum(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-block-by-latest-num")
                .aliases("getblockbylatestnum")
                .description("Get the latest N blocks")
                .option("count", "Number of blocks", true, OptionDef.Type.LONG)
                .handler((ctx, opts, wrapper, out) -> {
                    long count = opts.getLong("count");
                    Response.BlockListExtention blocks = WalletApi.getBlockByLatestNum2(count);
                    if (blocks == null) {
                        out.error("query_failed", "GetBlockByLatestNum failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(blocks), "GetBlockByLatestNum failed");
                    }
                })
                .build());
    }

    private static void registerGetBlockByLimitNext(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-block-by-limit-next")
                .aliases("getblockbylimitnext")
                .description("Get blocks in range [start, end)")
                .option("start", "Start block number", true, OptionDef.Type.LONG)
                .option("end", "End block number", true, OptionDef.Type.LONG)
                .handler((ctx, opts, wrapper, out) -> {
                    long start = opts.getLong("start");
                    long end = opts.getLong("end");
                    Response.BlockListExtention blocks = WalletApi.getBlockByLimitNext(start, end);
                    if (blocks == null) {
                        out.error("query_failed", "GetBlockByLimitNext failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(blocks), "GetBlockByLimitNext failed");
                    }
                })
                .build());
    }

    private static void registerGetTransactionById(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-transaction-by-id")
                .aliases("gettransactionbyid")
                .description("Get transaction by ID")
                .option("id", "Transaction ID", true)
                .handler((ctx, opts, wrapper, out) -> {
                    Chain.Transaction tx = wrapper.getTransactionByIdForCli(opts.getString("id"));
                    out.printMessage(Utils.formatMessageString(tx), "GetTransactionById failed");
                })
                .build());
    }

    private static void registerGetTransactionInfoById(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-transaction-info-by-id")
                .aliases("gettransactioninfobyid")
                .description("Get transaction info by ID")
                .option("id", "Transaction ID", true)
                .handler((ctx, opts, wrapper, out) -> {
                    Response.TransactionInfo txInfo = wrapper.getTransactionInfoByIdForCli(opts.getString("id"));
                    out.printMessage(Utils.formatMessageString(txInfo), "GetTransactionInfoById failed");
                })
                .build());
    }

    private static void registerGetTransactionCountByBlockNum(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-transaction-count-by-block-num")
                .aliases("gettransactioncountbyblocknum")
                .description("Get transaction count in a block")
                .option("number", "Block number", true, OptionDef.Type.LONG)
                .handler((ctx, opts, wrapper, out) -> {
                    long count = wrapper.getTransactionCountByBlockNum(opts.getLong("number"));
                    Map<String, Object> json = new LinkedHashMap<String, Object>();
                    json.put("count", count);
                    out.success("The block contains " + count + " transactions", json);
                })
                .build());
    }

    private static void registerGetAssetIssueByAccount(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-asset-issue-by-account")
                .aliases("getassetissuebyaccount")
                .description("Get asset issues by account address")
                .option("address", "Account address", true)
                .handler((ctx, opts, wrapper, out) -> {
                    Response.AssetIssueList result = WalletApi.getAssetIssueByAccount(opts.getAddress("address"));
                    if (result == null) {
                        out.error("query_failed", "GetAssetIssueByAccount failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result), "GetAssetIssueByAccount failed");
                    }
                })
                .build());
    }

    private static void registerGetAssetIssueById(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-asset-issue-by-id")
                .aliases("getassetissuebyid")
                .description("Get asset issue by ID")
                .option("id", "Asset ID", true)
                .handler((ctx, opts, wrapper, out) -> {
                    Contract.AssetIssueContract result = WalletApi.getAssetIssueById(opts.getString("id"));
                    out.protobuf(result, "GetAssetIssueById failed");
                })
                .build());
    }

    private static void registerGetAssetIssueByName(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-asset-issue-by-name")
                .aliases("getassetissuebyname")
                .description("Get asset issue by name")
                .option("name", "Asset name", true)
                .handler((ctx, opts, wrapper, out) -> {
                    Contract.AssetIssueContract result = WalletApi.getAssetIssueByName(opts.getString("name"));
                    out.protobuf(result, "GetAssetIssueByName failed");
                })
                .build());
    }

    private static void registerGetAssetIssueListByName(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-asset-issue-list-by-name")
                .aliases("getassetissuelistbyname")
                .description("Get asset issue list by name")
                .option("name", "Asset name", true)
                .handler((ctx, opts, wrapper, out) -> {
                    Response.AssetIssueList result = WalletApi.getAssetIssueListByName(opts.getString("name"));
                    if (result == null) {
                        out.error("query_failed", "GetAssetIssueListByName failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result), "GetAssetIssueListByName failed");
                    }
                })
                .build());
    }

    private static void registerGetChainParameters(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-chain-parameters")
                .aliases("getchainparameters")
                .description("Get chain parameters")
                .handler((ctx, opts, wrapper, out) -> {
                    Response.ChainParameters result = wrapper.getChainParametersForCli();
                    out.printMessage(Utils.formatMessageString(result), "GetChainParameters failed");
                })
                .build());
    }

    private static void registerGetBandwidthPrices(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-bandwidth-prices")
                .aliases("getbandwidthprices")
                .description("Get bandwidth prices history")
                .handler((ctx, opts, wrapper, out) -> {
                    Response.PricesResponseMessage result = WalletApi.getBandwidthPrices();
                    out.protobuf(result, "GetBandwidthPrices failed");
                })
                .build());
    }

    private static void registerGetEnergyPrices(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-energy-prices")
                .aliases("getenergyprices")
                .description("Get energy prices history")
                .handler((ctx, opts, wrapper, out) -> {
                    Response.PricesResponseMessage result = WalletApi.getEnergyPrices();
                    out.protobuf(result, "GetEnergyPrices failed");
                })
                .build());
    }

    private static void registerGetMemoFee(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-memo-fee")
                .aliases("getmemofee")
                .description("Get memo fee")
                .handler((ctx, opts, wrapper, out) -> {
                    Response.PricesResponseMessage result = WalletApi.getMemoFee();
                    out.protobuf(result, "GetMemoFee failed");
                })
                .build());
    }

    private static void registerGetNextMaintenanceTime(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-next-maintenance-time")
                .aliases("getnextmaintenancetime")
                .description("Get next maintenance time")
                .handler((ctx, opts, wrapper, out) -> {
                    long time = wrapper.getNextMaintenanceTime();
                    Map<String, Object> json = new LinkedHashMap<String, Object>();
                    json.put("next_maintenance_time", time);
                    out.success("Next maintenance time: " + time, json);
                })
                .build());
    }

    private static void registerGetContract(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-contract")
                .aliases("getcontract")
                .description("Get smart contract by address")
                .option("address", "Contract address", true)
                .handler((ctx, opts, wrapper, out) -> {
                    Common.SmartContract contract = WalletApi.getContract(opts.getAddress("address"));
                    if (contract == null) {
                        out.error("query_failed", "GetContract failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(contract), "GetContract failed");
                    }
                })
                .build());
    }

    private static void registerGetContractInfo(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-contract-info")
                .aliases("getcontractinfo")
                .description("Get smart contract info by address")
                .option("address", "Contract address", true)
                .handler((ctx, opts, wrapper, out) -> {
                    Response.SmartContractDataWrapper contractInfo = WalletApi.getContractInfo(opts.getAddress("address"));
                    if (contractInfo == null) {
                        out.error("query_failed", "GetContractInfo failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(contractInfo), "GetContractInfo failed");
                    }
                })
                .build());
    }

    private static void registerGetDelegatedResource(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-delegated-resource")
                .aliases("getdelegatedresource")
                .description("Get delegated resource between two addresses")
                .option("from", "From address", true)
                .option("to", "To address", true)
                .handler((ctx, opts, wrapper, out) -> {
                    opts.getAddress("from");
                    opts.getAddress("to");
                    Response.DelegatedResourceList result = WalletApi.getDelegatedResource(
                            opts.getString("from"), opts.getString("to"));
                    if (result == null) {
                        out.error("query_failed", "GetDelegatedResource failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result), "GetDelegatedResource failed");
                    }
                })
                .build());
    }

    private static void registerGetDelegatedResourceV2(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-delegated-resource-v2")
                .aliases("getdelegatedresourcev2")
                .description("Get delegated resource V2 between two addresses")
                .option("from", "From address", true)
                .option("to", "To address", true)
                .handler((ctx, opts, wrapper, out) -> {
                    opts.getAddress("from");
                    opts.getAddress("to");
                    Response.DelegatedResourceList result = WalletApi.getDelegatedResourceV2(
                            opts.getString("from"), opts.getString("to"));
                    if (result == null) {
                        out.error("query_failed", "GetDelegatedResourceV2 failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result), "GetDelegatedResourceV2 failed");
                    }
                })
                .build());
    }

    private static void registerGetDelegatedResourceAccountIndex(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-delegated-resource-account-index")
                .aliases("getdelegatedresourceaccountindex")
                .description("Get delegated resource account index")
                .option("address", "Address", true)
                .handler((ctx, opts, wrapper, out) -> {
                    opts.getAddress("address");
                    Response.DelegatedResourceAccountIndex result =
                            WalletApi.getDelegatedResourceAccountIndex(opts.getString("address"));
                    if (result == null) {
                        out.error("query_failed", "GetDelegatedResourceAccountIndex failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result),
                                "GetDelegatedResourceAccountIndex failed");
                    }
                })
                .build());
    }

    private static void registerGetDelegatedResourceAccountIndexV2(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-delegated-resource-account-index-v2")
                .aliases("getdelegatedresourceaccountindexv2")
                .description("Get delegated resource account index V2")
                .option("address", "Address", true)
                .handler((ctx, opts, wrapper, out) -> {
                    opts.getAddress("address");
                    Response.DelegatedResourceAccountIndex result =
                            WalletApi.getDelegatedResourceAccountIndexV2(opts.getString("address"));
                    if (result == null) {
                        out.error("query_failed", "GetDelegatedResourceAccountIndexV2 failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result),
                                "GetDelegatedResourceAccountIndexV2 failed");
                    }
                })
                .build());
    }

    private static void registerGetCanDelegatedMaxSize(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-can-delegated-max-size")
                .aliases("getcandelegatedmaxsize")
                .description("Get max delegatable size for a resource type")
                .option("owner", "Owner address", true)
                .option("type", "Resource type (0=BANDWIDTH, 1=ENERGY)", true, OptionDef.Type.LONG)
                .handler((ctx, opts, wrapper, out) -> {
                    long maxSize = WalletApi.getCanDelegatedMaxSize(
                            opts.getAddress("owner"), opts.getInt("type"));
                    Map<String, Object> json = new LinkedHashMap<String, Object>();
                    json.put("max_size", maxSize);
                    out.success("Max delegatable size: " + maxSize, json);
                })
                .build());
    }

    private static void registerGetAvailableUnfreezeCount(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-available-unfreeze-count")
                .aliases("getavailableunfreezecount")
                .description("Get available unfreeze count")
                .option("address", "Address", true)
                .handler((ctx, opts, wrapper, out) -> {
                    long count = WalletApi.getAvailableUnfreezeCount(opts.getAddress("address"));
                    Map<String, Object> json = new LinkedHashMap<String, Object>();
                    json.put("count", count);
                    out.success("Available unfreeze count: " + count, json);
                })
                .build());
    }

    private static void registerGetCanWithdrawUnfreezeAmount(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-can-withdraw-unfreeze-amount")
                .aliases("getcanwithdrawunfreezeamount")
                .description("Get withdrawable unfreeze amount")
                .option("address", "Address", true)
                .option("timestamp", "Timestamp in milliseconds (default: now)", false, OptionDef.Type.LONG)
                .handler((ctx, opts, wrapper, out) -> {
                    long ts = opts.has("timestamp") ? opts.getLong("timestamp") : System.currentTimeMillis();
                    long amount = WalletApi.getCanWithdrawUnfreezeAmount(opts.getAddress("address"), ts);
                    Map<String, Object> json = new LinkedHashMap<String, Object>();
                    json.put("amount", amount);
                    out.success("Can withdraw unfreeze amount: " + amount, json);
                })
                .build());
    }

    private static void registerGetBrokerage(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-brokerage")
                .aliases("getbrokerage")
                .description("Get witness brokerage ratio")
                .option("address", "Witness address", true)
                .handler((ctx, opts, wrapper, out) -> {
                    long brokerage = wrapper.getBrokerage(opts.getAddress("address"));
                    Map<String, Object> json = new LinkedHashMap<String, Object>();
                    json.put("brokerage", brokerage);
                    out.success("Brokerage: " + brokerage, json);
                })
                .build());
    }

    private static void registerGetReward(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-reward")
                .aliases("getreward")
                .description("Get unclaimed reward")
                .option("address", "Address", true)
                .handler((ctx, opts, wrapper, out) -> {
                    org.tron.trident.api.GrpcAPI.NumberMessage result =
                            wrapper.getReward(opts.getAddress("address"));
                    if (result == null) {
                        out.error("query_failed", "GetReward failed");
                    } else {
                        long reward = result.getNum();
                        Map<String, Object> json = new LinkedHashMap<String, Object>();
                        json.put("reward", reward);
                        out.success("Reward: " + reward, json);
                    }
                })
                .build());
    }

    private static void registerListNodes(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("list-nodes")
                .aliases("listnodes")
                .description("List connected nodes")
                .handler((ctx, opts, wrapper, out) -> {
                    Response.NodeList nodeList = WalletApi.listNodes();
                    if (nodeList == null) {
                        out.error("query_failed", "ListNodes failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(nodeList), "ListNodes failed");
                    }
                })
                .build());
    }

    private static void registerListWitnesses(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("list-witnesses")
                .aliases("listwitnesses")
                .description("List all witnesses")
                .handler((ctx, opts, wrapper, out) -> {
                    Response.WitnessList witnessList = wrapper.listWitnessesForCli();
                    out.printMessage(Utils.formatMessageString(witnessList), "ListWitnesses failed");
                })
                .build());
    }

    private static void registerListAssetIssue(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("list-asset-issue")
                .aliases("listassetissue")
                .description("List all asset issues")
                .handler((ctx, opts, wrapper, out) -> {
                    Response.AssetIssueList result = WalletApi.getAssetIssueList();
                    out.protobuf(result, "ListAssetIssue failed");
                })
                .build());
    }

    private static void registerListAssetIssuePaginated(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("list-asset-issue-paginated")
                .aliases("listassetissuepaginated")
                .description("List asset issues with pagination")
                .option("offset", "Start offset", true, OptionDef.Type.LONG)
                .option("limit", "Page size", true, OptionDef.Type.LONG)
                .handler((ctx, opts, wrapper, out) -> {
                    Response.AssetIssueList result = WalletApi.getPaginatedAssetIssueList(
                            opts.getLong("offset"), opts.getLong("limit"));
                    if (result == null) {
                        out.error("query_failed", "ListAssetIssuePaginated failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result), "ListAssetIssuePaginated failed");
                    }
                })
                .build());
    }

    private static void registerListProposals(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("list-proposals")
                .aliases("listproposals")
                .description("List all proposals")
                .handler((ctx, opts, wrapper, out) -> {
                    Response.ProposalList result = WalletApi.listProposals();
                    if (result == null) {
                        out.error("query_failed", "ListProposals failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result), "ListProposals failed");
                    }
                })
                .build());
    }

    private static void registerListProposalsPaginated(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("list-proposals-paginated")
                .aliases("listproposalspaginated")
                .description("List proposals with pagination")
                .option("offset", "Start offset", true, OptionDef.Type.LONG)
                .option("limit", "Page size", true, OptionDef.Type.LONG)
                .handler((ctx, opts, wrapper, out) -> {
                    Response.ProposalList result = WalletApi.getProposalListPaginated(
                            opts.getLong("offset"), opts.getLong("limit"));
                    if (result == null) {
                        out.error("query_failed", "ListProposalsPaginated failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result), "ListProposalsPaginated failed");
                    }
                })
                .build());
    }

    private static void registerGetProposal(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-proposal")
                .aliases("getproposal")
                .description("Get proposal by ID")
                .option("id", "Proposal ID", true, OptionDef.Type.LONG)
                .handler((ctx, opts, wrapper, out) -> {
                    long id = opts.getLong("id");
                    Response.Proposal result = WalletApi.getProposal(String.valueOf(id));
                    if (result == null) {
                        out.error("query_failed", "GetProposal failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result), "GetProposal failed");
                    }
                })
                .build());
    }

    private static void registerListExchanges(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("list-exchanges")
                .aliases("listexchanges")
                .description("List all exchanges")
                .handler((ctx, opts, wrapper, out) -> {
                    Response.ExchangeList result = WalletApi.listExchanges();
                    if (result == null) {
                        out.error("query_failed", "ListExchanges failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result), "ListExchanges failed");
                    }
                })
                .build());
    }

    private static void registerListExchangesPaginated(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("list-exchanges-paginated")
                .aliases("listexchangespaginated")
                .description("List exchanges with pagination")
                .option("offset", "Start offset", true, OptionDef.Type.LONG)
                .option("limit", "Page size", true, OptionDef.Type.LONG)
                .handler((ctx, opts, wrapper, out) -> {
                    Response.ExchangeList result = WalletApi.getExchangeListPaginated(
                            opts.getLong("offset"), opts.getLong("limit"));
                    if (result == null) {
                        out.error("query_failed", "ListExchangesPaginated failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result), "ListExchangesPaginated failed");
                    }
                })
                .build());
    }

    private static void registerGetExchange(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-exchange")
                .aliases("getexchange")
                .description("Get exchange by ID")
                .option("id", "Exchange ID", true)
                .handler((ctx, opts, wrapper, out) -> {
                    Response.Exchange result = WalletApi.getExchange(opts.getString("id"));
                    if (result == null) {
                        out.error("query_failed", "GetExchange failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result), "GetExchange failed");
                    }
                })
                .build());
    }

    private static void registerGetMarketOrderByAccount(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-market-order-by-account")
                .aliases("getmarketorderbyaccount")
                .description("Get market orders by account")
                .option("address", "Account address", true)
                .handler((ctx, opts, wrapper, out) -> {
                    Response.MarketOrderList result = WalletApi.getMarketOrderByAccount(opts.getAddress("address"));
                    if (result == null) {
                        out.error("query_failed", "GetMarketOrderByAccount failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result), "GetMarketOrderByAccount failed");
                    }
                })
                .build());
    }

    private static void registerGetMarketOrderById(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-market-order-by-id")
                .aliases("getmarketorderbyid")
                .description("Get market order by ID")
                .option("id", "Order ID hex", true)
                .handler((ctx, opts, wrapper, out) -> {
                    byte[] orderId = CommandSupport.requireHex(out, "id", opts.getString("id"));
                    Response.MarketOrder result;
                    try {
                        result = WalletApi.getMarketOrderById(orderId);
                    } catch (Exception e) {
                        out.error("query_failed",
                                e.getMessage() != null ? e.getMessage() : "GetMarketOrderById failed");
                        return;
                    }
                    if (result == null) {
                        out.error("query_failed", "GetMarketOrderById failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result), "GetMarketOrderById failed");
                    }
                })
                .build());
    }

    private static void registerGetMarketOrderListByPair(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-market-order-list-by-pair")
                .aliases("getmarketorderlistbypair")
                .description("Get market order list by token pair")
                .option("sell-token", "Sell token name", true)
                .option("buy-token", "Buy token name", true)
                .handler((ctx, opts, wrapper, out) -> {
                    Response.MarketOrderList result = WalletApi.getMarketOrderListByPair(
                            opts.getString("sell-token").getBytes(),
                            opts.getString("buy-token").getBytes());
                    if (result == null) {
                        out.error("query_failed", "GetMarketOrderListByPair failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result), "GetMarketOrderListByPair failed");
                    }
                })
                .build());
    }

    private static void registerGetMarketPairList(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-market-pair-list")
                .aliases("getmarketpairlist")
                .description("Get all market trading pairs")
                .handler((ctx, opts, wrapper, out) -> {
                    Response.MarketOrderPairList result = wrapper.getMarketPairListForCli();
                    out.printMessage(Utils.formatMessageString(result), "GetMarketPairList failed");
                })
                .build());
    }

    private static void registerGetMarketPriceByPair(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("get-market-price-by-pair")
                .aliases("getmarketpricebypair")
                .description("Get market price by token pair")
                .option("sell-token", "Sell token name", true)
                .option("buy-token", "Buy token name", true)
                .handler((ctx, opts, wrapper, out) -> {
                    Response.MarketPriceList result = WalletApi.getMarketPriceByPair(
                            opts.getString("sell-token").getBytes(),
                            opts.getString("buy-token").getBytes());
                    if (result == null) {
                        out.error("query_failed", "GetMarketPriceByPair failed");
                    } else {
                        out.printMessage(Utils.formatMessageString(result), "GetMarketPriceByPair failed");
                    }
                })
                .build());
    }

    private static void registerGasFreeInfo(CommandRegistry registry) {
        registry.add(CommandDefinition.builder()
                .authPolicyResolver(opts -> opts.has("address")
                        ? CommandDefinition.AuthPolicy.NEVER
                        : CommandDefinition.AuthPolicy.REQUIRE)
                .name("gas-free-info")
                .aliases("gasfreeinfo")
                .description("Get GasFree service info")
                .option("address", "Address to query (default: current wallet)", false)
                .handler((ctx, opts, wrapper, out) -> {
                    String address = opts.has("address") ? opts.getString("address") : null;
                    String rendered = JSON.toJSONString(wrapper.getGasFreeInfoDataForCli(address), true);
                    out.printMessage(rendered, "GetGasFreeInfo failed");
                })
                .build());
    }

    private static void registerGasFreeTrace(CommandRegistry registry) {
        registry.add(noAuthCommand()
                .name("gas-free-trace")
                .aliases("gasfreetrace")
                .description("Trace a GasFree transaction")
                .option("id", "Transaction ID", true)
                .handler((ctx, opts, wrapper, out) -> {
                    String rendered = JSON.toJSONString(wrapper.gasFreeTraceData(opts.getString("id")), true);
                    out.printMessage(rendered, "GasFreeTrace failed");
                })
                .build());
    }
}
