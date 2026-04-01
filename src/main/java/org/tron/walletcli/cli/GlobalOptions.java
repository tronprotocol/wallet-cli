package org.tron.walletcli.cli;

import java.util.ArrayList;
import java.util.List;

public class GlobalOptions {

    private boolean interactive = false;
    private boolean help = false;
    private boolean version = false;
    private String output = "text";
    private String network = null;
    private String privateKey = null;
    private String mnemonic = null;
    private String wallet = null;
    private String grpcEndpoint = null;
    private boolean quiet = false;
    private boolean verbose = false;
    private String command = null;
    private String[] commandArgs = new String[0];

    public boolean isInteractive() { return interactive; }
    public boolean isHelp() { return help; }
    public boolean isVersion() { return version; }
    public String getOutput() { return output; }
    public String getNetwork() { return network; }
    public String getPrivateKey() { return privateKey; }
    public String getMnemonic() { return mnemonic; }
    public String getWallet() { return wallet; }
    public String getGrpcEndpoint() { return grpcEndpoint; }
    public boolean isQuiet() { return quiet; }
    public boolean isVerbose() { return verbose; }
    public String getCommand() { return command; }
    public String[] getCommandArgs() { return commandArgs; }

    public OutputFormatter.OutputMode getOutputMode() {
        return "json".equalsIgnoreCase(output)
                ? OutputFormatter.OutputMode.JSON
                : OutputFormatter.OutputMode.TEXT;
    }

    public static GlobalOptions parse(String[] args) {
        GlobalOptions opts = new GlobalOptions();
        List<String> remaining = new ArrayList<String>();
        boolean commandFound = false;

        for (int i = 0; i < args.length; i++) {
            if (commandFound) {
                remaining.add(args[i]);
                continue;
            }
            switch (args[i]) {
                case "--interactive":
                    opts.interactive = true;
                    break;
                case "--help":
                case "-h":
                    opts.help = true;
                    break;
                case "--version":
                    opts.version = true;
                    break;
                case "--output":
                    if (i + 1 < args.length) opts.output = args[++i];
                    break;
                case "--network":
                    if (i + 1 < args.length) opts.network = args[++i];
                    break;
                case "--private-key":
                    if (i + 1 < args.length) opts.privateKey = args[++i];
                    break;
                case "--mnemonic":
                    if (i + 1 < args.length) opts.mnemonic = args[++i];
                    break;
                case "--wallet":
                    if (i + 1 < args.length) opts.wallet = args[++i];
                    break;
                case "--grpc-endpoint":
                    if (i + 1 < args.length) opts.grpcEndpoint = args[++i];
                    break;
                case "--quiet":
                    opts.quiet = true;
                    break;
                case "--verbose":
                    opts.verbose = true;
                    break;
                default:
                    if (!args[i].startsWith("--")) {
                        opts.command = args[i].toLowerCase();
                        commandFound = true;
                    } else {
                        // Unknown global flag — treat as start of command args
                        remaining.add(args[i]);
                        commandFound = true;
                    }
                    break;
            }
        }
        opts.commandArgs = remaining.toArray(new String[0]);
        return opts;
    }
}
