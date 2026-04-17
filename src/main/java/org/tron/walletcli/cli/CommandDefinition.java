package org.tron.walletcli.cli;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Immutable metadata for a single CLI command: name, aliases, description,
 * option definitions, and the handler that executes it.
 *
 * <p>Use {@link #builder()} to construct instances via the fluent Builder API.
 */
public class CommandDefinition {

    public enum AuthPolicy {
        NEVER,
        REQUIRE
    }

    public interface AuthPolicyResolver {
        AuthPolicy resolve(ParsedOptions opts);
    }

    private final String name;
    private final List<String> aliases;
    private final String description;
    private final List<OptionDef> options;
    private final CommandHandler handler;
    private final AuthPolicyResolver authPolicyResolver;

    private CommandDefinition(Builder b) {
        this.name = b.name;
        this.aliases = Collections.unmodifiableList(new ArrayList<String>(b.aliases));
        this.description = b.description;
        this.options = Collections.unmodifiableList(new ArrayList<OptionDef>(b.options));
        this.handler = b.handler;
        this.authPolicyResolver = b.authPolicyResolver;
    }

    // ---- Accessors ----------------------------------------------------------

    public String getName() {
        return name;
    }

    public List<String> getAliases() {
        return aliases;
    }

    public String getDescription() {
        return description;
    }

    public List<OptionDef> getOptions() {
        return options;
    }

    public CommandHandler getHandler() {
        return handler;
    }

    public AuthPolicy resolveAuthPolicy(ParsedOptions opts) {
        AuthPolicy policy = authPolicyResolver.resolve(opts);
        if (policy == null) {
            throw new IllegalStateException("Auth policy resolver returned null for command: " + name);
        }
        return policy;
    }

    // ---- Argument parsing ---------------------------------------------------

    /**
     * Parses command-local option tokens into {@link ParsedOptions}.
     *
     * <p>Rules:
     * <ul>
     *   <li>{@code --key value} or {@code --key=value} sets key to value</li>
     *   <li>{@code -m} is accepted only for commands that declare a {@code multi} option</li>
     *   <li>Boolean flags: {@code --flag} implies {@code true}; explicit values must be
     *       one of {@code true}, {@code false}, {@code 1}, {@code 0}, {@code yes}, or {@code no}</li>
     * </ul>
     *
     * <p>After parsing, all required options are validated.
     *
     * @param args the argument tokens (excluding the command name itself)
     * @return parsed options
     * @throws IllegalArgumentException if required options are missing or args are malformed
     */
    public ParsedOptions parseArgs(String[] args) {
        Map<String, String> values = new LinkedHashMap<String, String>();

        Map<String, OptionDef> optionsByName = new LinkedHashMap<String, OptionDef>();
        for (OptionDef opt : options) {
            optionsByName.put(opt.getName(), opt);
        }

        int i = 0;
        while (i < args.length) {
            String token = args[i];

            if ("-m".equals(token)) {
                OptionDef multiOption = optionsByName.get("multi");
                if (multiOption == null || multiOption.getType() != OptionDef.Type.BOOLEAN) {
                    throw new CliUsageException("Option -m is only supported for commands with --multi");
                }
                putBooleanValue(values, "multi", "true");
                i++;
                continue;
            }

            if (token.startsWith("--")) {
                ParsedOptionToken optionToken = parseLongOptionToken(token);
                OptionDef def = optionsByName.get(optionToken.name);
                if (def == null) {
                    throw new CliUsageException("Unknown option: --" + optionToken.name);
                }

                if (def.getType() == OptionDef.Type.BOOLEAN) {
                    if (optionToken.hasInlineValue()) {
                        putBooleanValue(values, optionToken.name,
                                normalizeBooleanValue(optionToken.name, optionToken.inlineValue));
                        i++;
                        continue;
                    }

                    putBooleanValue(values, optionToken.name, "true");
                    i++;
                } else {
                    if (values.containsKey(optionToken.name)) {
                        throw new CliUsageException("Repeated option: --" + optionToken.name);
                    }

                    if (optionToken.hasInlineValue()) {
                        values.put(optionToken.name,
                                requireNonEmptyValue(optionToken.name, optionToken.inlineValue));
                        i++;
                    } else {
                        if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
                            throw new CliUsageException("Missing value for --" + optionToken.name);
                        }
                        values.put(optionToken.name,
                                requireNonEmptyValue(optionToken.name, args[i + 1]));
                        i += 2;
                    }
                }
            } else {
                if (token.startsWith("-")) {
                    throw new CliUsageException("Unknown option: " + token);
                }
                throw new CliUsageException("Unexpected argument: " + token);
            }
        }

        List<String> missing = new ArrayList<String>();
        for (OptionDef opt : options) {
            if (opt.isRequired() && !values.containsKey(opt.getName())) {
                missing.add(opt.getName());
            }
        }
        if (!missing.isEmpty()) {
            StringBuilder sb = new StringBuilder("Missing required option(s): ");
            for (int j = 0; j < missing.size(); j++) {
                if (j > 0) {
                    sb.append(", ");
                }
                sb.append("--").append(missing.get(j));
            }
            throw new CliUsageException(sb.toString());
        }

        return new ParsedOptions(values);
    }

    private static String requireNonEmptyValue(String optionName, String rawValue) {
        if (rawValue == null || rawValue.isEmpty()) {
            throw new CliUsageException("Missing or empty value for --" + optionName);
        }
        return rawValue;
    }

    private static String normalizeBooleanValue(String optionName, String rawValue) {
        return "true".equalsIgnoreCase(rawValue)
                || "1".equals(rawValue)
                || "yes".equalsIgnoreCase(rawValue)
                ? "true"
                : "false".equalsIgnoreCase(rawValue)
                || "0".equals(rawValue)
                || "no".equalsIgnoreCase(rawValue)
                ? "false"
                : invalidBooleanValue(optionName, rawValue);
    }

    private static String invalidBooleanValue(String optionName, String rawValue) {
        throw new CliUsageException(
                "Option --" + optionName + " requires a boolean value (true/false/1/0/yes/no), got: "
                        + rawValue);
    }

    private static void putBooleanValue(Map<String, String> values, String optionName, String normalizedValue) {
        String existing = values.get(optionName);
        if (existing == null) {
            values.put(optionName, normalizedValue);
            return;
        }
        if (!existing.equals(normalizedValue)) {
            throw new CliUsageException("Conflicting values for option: --" + optionName);
        }
    }

    private static ParsedOptionToken parseLongOptionToken(String token) {
        int equalsIndex = token.indexOf('=');
        if (equalsIndex < 0) {
            String name = token.substring(2);
            if (name.isEmpty()) {
                throw new CliUsageException("Empty option name: --");
            }
            return new ParsedOptionToken(name, null, false);
        }

        String name = token.substring(2, equalsIndex);
        if (name.isEmpty()) {
            throw new CliUsageException("Empty option name: --");
        }
        return new ParsedOptionToken(name, token.substring(equalsIndex + 1), true);
    }

    private static final class ParsedOptionToken {
        private final String name;
        private final String inlineValue;
        private final boolean hasInlineValue;

        private ParsedOptionToken(String name, String inlineValue, boolean hasInlineValue) {
            this.name = name;
            this.inlineValue = inlineValue;
            this.hasInlineValue = hasInlineValue;
        }

        private boolean hasInlineValue() {
            return hasInlineValue;
        }
    }

    // ---- Help formatting ----------------------------------------------------

    /**
     * Formats a help text block for this command.
     */
    public String formatHelp() {
        StringBuilder sb = new StringBuilder();
        sb.append("Usage: wallet-cli ").append(name).append(" [options]\n\n");
        sb.append(description).append("\n");

        if (!aliases.isEmpty()) {
            sb.append("\nAliases: ");
            for (int i = 0; i < aliases.size(); i++) {
                if (i > 0) {
                    sb.append(", ");
                }
                sb.append(aliases.get(i));
            }
            sb.append("\n");
        }

        if (!options.isEmpty()) {
            sb.append("\nOptions:\n");

            // Calculate column width
            int maxNameLen = 0;
            for (OptionDef opt : options) {
                int len = opt.getName().length() + 2; // "--" prefix
                if (len > maxNameLen) {
                    maxNameLen = len;
                }
            }

            String fmt = "  %-" + (maxNameLen + 4) + "s %s%s\n";
            for (OptionDef opt : options) {
                String nameCol = "--" + opt.getName();
                String reqMarker = opt.isRequired() ? " (required)" : "";
                sb.append(String.format(fmt, nameCol, opt.getDescription(), reqMarker));
            }
        }

        return sb.toString();
    }

    // ---- Builder ------------------------------------------------------------

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String name;
        private List<String> aliases = new ArrayList<String>();
        private String description = "";
        private List<OptionDef> options = new ArrayList<OptionDef>();
        private CommandHandler handler;
        private AuthPolicyResolver authPolicyResolver = opts -> AuthPolicy.REQUIRE;

        private Builder() {
        }

        public Builder name(String name) {
            this.name = name;
            return this;
        }

        public Builder aliases(String... aliases) {
            this.aliases = Arrays.asList(aliases);
            return this;
        }

        public Builder description(String description) {
            this.description = description;
            return this;
        }

        public Builder option(String name, String desc, boolean required) {
            this.options.add(new OptionDef(name, desc, required));
            return this;
        }

        public Builder option(String name, String desc, boolean required, OptionDef.Type type) {
            this.options.add(new OptionDef(name, desc, required, type));
            return this;
        }

        public Builder handler(CommandHandler handler) {
            this.handler = handler;
            return this;
        }

        public Builder authPolicy(AuthPolicy authPolicy) {
            if (authPolicy == null) {
                throw new IllegalArgumentException("authPolicy cannot be null");
            }
            this.authPolicyResolver = opts -> authPolicy;
            return this;
        }

        public Builder authPolicyResolver(AuthPolicyResolver authPolicyResolver) {
            if (authPolicyResolver == null) {
                throw new IllegalArgumentException("authPolicyResolver cannot be null");
            }
            this.authPolicyResolver = authPolicyResolver;
            return this;
        }

        public CommandDefinition build() {
            if (name == null || name.isEmpty()) {
                throw new IllegalStateException("Command name is required");
            }
            if (handler == null) {
                throw new IllegalStateException("Command handler is required");
            }
            return new CommandDefinition(this);
        }
    }
}
