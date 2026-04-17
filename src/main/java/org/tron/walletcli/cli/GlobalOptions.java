package org.tron.walletcli.cli;

import java.util.Arrays;
import java.util.Locale;

public class GlobalOptions {

    private boolean interactive = false;
    private boolean help = false;
    private boolean version = false;
    private String output = "text";
    private String network = null;
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
    public String getWallet() { return wallet; }
    public String getGrpcEndpoint() { return grpcEndpoint; }
    public boolean isQuiet() { return quiet; }
    public boolean isVerbose() { return verbose; }
    public String getCommand() { return command; }
    public String[] getCommandArgs() { return java.util.Arrays.copyOf(commandArgs, commandArgs.length); }

    public OutputFormatter.OutputMode getOutputMode() {
        return "json".equalsIgnoreCase(output)
                ? OutputFormatter.OutputMode.JSON
                : OutputFormatter.OutputMode.TEXT;
    }

    public static GlobalOptions parse(String[] args) {
        GlobalOptions opts = new GlobalOptions();
        boolean outputSeen = false;
        boolean networkSeen = false;
        boolean walletSeen = false;
        boolean grpcEndpointSeen = false;
        for (int i = 0; i < args.length; i++) {
            String token = args[i];

            if (!token.startsWith("-")) {
                opts.command = token.toLowerCase(Locale.ROOT);
                opts.commandArgs = Arrays.copyOfRange(args, i + 1, args.length);
                return opts;
            }

            if ("-h".equals(token)) {
                opts.help = true;
                continue;
            }

            if (token.startsWith("-h=")) {
                throw new CliUsageException("Option -h does not take a value");
            }

            if (!token.startsWith("--")) {
                throw new CliUsageException("Unknown global option: " + token);
            }

            ParsedLongOption parsed = parseLongOptionToken(token);
            switch (parsed.name) {
                case "interactive":
                    ensureNoInlineValue(parsed, "--interactive");
                    opts.interactive = true;
                    break;
                case "help":
                    ensureNoInlineValue(parsed, "--help");
                    opts.help = true;
                    break;
                case "version":
                    ensureNoInlineValue(parsed, "--version");
                    opts.version = true;
                    break;
                case "quiet":
                    ensureNoInlineValue(parsed, "--quiet");
                    if (opts.verbose) {
                        throw new CliUsageException("Conflicting global options: --quiet and --verbose");
                    }
                    opts.quiet = true;
                    break;
                case "verbose":
                    ensureNoInlineValue(parsed, "--verbose");
                    if (opts.quiet) {
                        throw new CliUsageException("Conflicting global options: --quiet and --verbose");
                    }
                    opts.verbose = true;
                    break;
                case "output":
                    ensureNotRepeated(outputSeen, "--output");
                    outputSeen = true;
                    opts.output = requireOneOf(args, i, parsed, "--output", "text", "json");
                    if (!parsed.hasInlineValue()) {
                        i++;
                    }
                    break;
                case "network":
                    ensureNotRepeated(networkSeen, "--network");
                    networkSeen = true;
                    opts.network = requireOneOf(args, i, parsed, "--network", "main", "nile", "shasta", "custom");
                    if (!parsed.hasInlineValue()) {
                        i++;
                    }
                    break;
                case "wallet":
                    ensureNotRepeated(walletSeen, "--wallet");
                    walletSeen = true;
                    opts.wallet = requireValue(args, i, parsed, "--wallet");
                    if (!parsed.hasInlineValue()) {
                        i++;
                    }
                    break;
                case "grpc-endpoint":
                    ensureNotRepeated(grpcEndpointSeen, "--grpc-endpoint");
                    grpcEndpointSeen = true;
                    opts.grpcEndpoint = requireValue(args, i, parsed, "--grpc-endpoint");
                    if (!parsed.hasInlineValue()) {
                        i++;
                    }
                    break;
                default:
                    throw new CliUsageException("Unknown global option: --" + parsed.name);
            }
        }
        return opts;
    }

    private static void ensureNoInlineValue(ParsedLongOption option, String optionName) {
        if (option.hasInlineValue()) {
            throw new CliUsageException("Option " + optionName + " does not take a value");
        }
    }

    private static void ensureNotRepeated(boolean alreadySeen, String optionName) {
        if (alreadySeen) {
            throw new CliUsageException("Repeated global option: " + optionName);
        }
    }

    private static String requireValue(String[] args, int optionIndex, ParsedLongOption option, String optionName) {
        if (option.hasInlineValue()) {
            if (option.inlineValue.isEmpty()) {
                throw new CliUsageException("Missing or empty value for " + optionName);
            }
            return option.inlineValue;
        }

        int valueIndex = optionIndex + 1;
        if (valueIndex >= args.length || args[valueIndex].startsWith("-")) {
            throw new CliUsageException("Missing value for " + optionName);
        }
        return args[valueIndex];
    }

    private static String requireOneOf(String[] args, int optionIndex, ParsedLongOption option, String optionName,
                                       String... allowedValues) {
        String value = requireValue(args, optionIndex, option, optionName);
        for (String allowedValue : allowedValues) {
            if (allowedValue.equalsIgnoreCase(value)) {
                return allowedValue;
            }
        }
        throw new CliUsageException("Invalid value for " + optionName + ": " + value);
    }

    private static ParsedLongOption parseLongOptionToken(String token) {
        int equalsIndex = token.indexOf('=');
        if (equalsIndex < 0) {
            String name = token.substring(2);
            if (name.isEmpty()) {
                throw new CliUsageException("Empty option name: --");
            }
            return new ParsedLongOption(name, null, false);
        }

        String name = token.substring(2, equalsIndex);
        if (name.isEmpty()) {
            throw new CliUsageException("Empty option name: --");
        }
        return new ParsedLongOption(name, token.substring(equalsIndex + 1), true);
    }

    private static final class ParsedLongOption {
        private final String name;
        private final String inlineValue;
        private final boolean hasInlineValue;

        private ParsedLongOption(String name, String inlineValue, boolean hasInlineValue) {
            this.name = name;
            this.inlineValue = inlineValue;
            this.hasInlineValue = hasInlineValue;
        }

        private boolean hasInlineValue() {
            return hasInlineValue;
        }
    }
}
