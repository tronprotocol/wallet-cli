package org.tron.walletcli.cli;

/**
 * Defines a single command-line option: its name, description, whether it is
 * required, and the expected value type.
 */
public class OptionDef {

    public enum Type {
        STRING,
        LONG,
        BOOLEAN,
        ADDRESS
    }

    private final String name;
    private final String description;
    private final boolean required;
    private final Type type;

    public OptionDef(String name, String description, boolean required, Type type) {
        this.name = name;
        this.description = description;
        this.required = required;
        this.type = type;
    }

    public OptionDef(String name, String description, boolean required) {
        this(name, description, required, Type.STRING);
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public boolean isRequired() {
        return required;
    }

    public Type getType() {
        return type;
    }
}
