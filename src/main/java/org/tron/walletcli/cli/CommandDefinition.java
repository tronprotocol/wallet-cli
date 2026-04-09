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

    private final String name;
    private final List<String> aliases;
    private final String description;
    private final List<OptionDef> options;
    private final CommandHandler handler;

    private CommandDefinition(Builder b) {
        this.name = b.name;
        this.aliases = Collections.unmodifiableList(new ArrayList<String>(b.aliases));
        this.description = b.description;
        this.options = Collections.unmodifiableList(new ArrayList<OptionDef>(b.options));
        this.handler = b.handler;
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

    // ---- Argument parsing ---------------------------------------------------

    /**
     * Parses a {@code --key value} argument array into {@link ParsedOptions}.
     *
     * <p>Rules:
     * <ul>
     *   <li>{@code --key value} sets key to value</li>
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

        // Build a lookup of known option names for boolean-flag detection
        Map<String, OptionDef> optionsByName = new LinkedHashMap<String, OptionDef>();
        for (OptionDef opt : options) {
            optionsByName.put(opt.getName(), opt);
        }

        int i = 0;
        while (i < args.length) {
            String token = args[i];

            if ("-m".equals(token)) {
                if (!optionsByName.containsKey("multi")) {
                    throw new IllegalArgumentException("Unexpected argument: " + token);
                }
                values.put("multi", "true");
                i++;
                continue;
            }

            if (token.startsWith("--")) {
                String key = token.substring(2);
                if (key.isEmpty()) {
                    throw new IllegalArgumentException("Empty option name: --");
                }

                OptionDef def = optionsByName.get(key);
                if (def != null && def.getType() == OptionDef.Type.BOOLEAN) {
                    if (i + 1 >= args.length || args[i + 1].startsWith("--")) {
                        values.put(key, "true");
                        i++;
                        continue;
                    }
                    String rawValue = args[i + 1];
                    if (!isSupportedBooleanValue(rawValue)) {
                        throw new IllegalArgumentException(
                                "Option --" + key + " requires a boolean value (true/false/1/0/yes/no), got: "
                                        + rawValue);
                    }
                    values.put(key, rawValue);
                    i += 2;
                } else {
                    // Determine whether this is a boolean flag (no following value)
                    boolean isBooleanFlag = i + 1 >= args.length || args[i + 1].startsWith("--");
                    if (isBooleanFlag) {
                        values.put(key, "true");
                        i++;
                    } else {
                        values.put(key, args[i + 1]);
                        i += 2;
                    }
                }
            } else {
                throw new IllegalArgumentException("Unexpected argument: " + token);
            }
        }

        // Validate required options
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
            throw new IllegalArgumentException(sb.toString());
        }

        return new ParsedOptions(values);
    }

    private static boolean isSupportedBooleanValue(String rawValue) {
        return "true".equalsIgnoreCase(rawValue)
                || "false".equalsIgnoreCase(rawValue)
                || "1".equals(rawValue)
                || "0".equals(rawValue)
                || "yes".equalsIgnoreCase(rawValue)
                || "no".equalsIgnoreCase(rawValue);
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
