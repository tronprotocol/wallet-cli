package org.tron.walletcli.cli;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import org.junit.Test;
import org.tron.walletcli.cli.aliases.AliasType;
import org.tron.walletcli.cli.aliases.ResolutionResult;
import org.tron.walletserver.WalletApi;

import static org.junit.Assert.assertTrue;

public class OutputFormatterResolvedTest {

    @Test
    public void jsonSuccessIncludesResolvedMeta() {
        ByteArrayOutputStream stdout = new ByteArrayOutputStream();
        OutputFormatter formatter = new OutputFormatter(
                OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);
        formatter.resolved(new ResolutionResult("contract", "USDT",
                WalletApi.decodeFromBase58Check("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"),
                "USDT", AliasType.TOKEN, "builtin"));
        formatter.successMessage("ok");
        formatter.flush();
        String json = stdout.toString();
        assertTrue(json.contains("\"meta\""));
        assertTrue(json.contains("\"resolved\""));
        assertTrue(json.contains("\"USDT\""));
    }

    @Test
    public void jsonErrorIncludesResolvedMeta() {
        ByteArrayOutputStream stdout = new ByteArrayOutputStream();
        OutputFormatter formatter = new OutputFormatter(
                OutputFormatter.OutputMode.JSON, false, new PrintStream(stdout), System.err);
        formatter.resolved(new ResolutionResult("contract", "USDT",
                WalletApi.decodeFromBase58Check("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"),
                "USDT", AliasType.TOKEN, "builtin"));
        try {
            formatter.error("execution_error", "failed after alias resolution");
        } catch (CliAbortException expected) {
            // expected; formatter records the error for flush().
        }
        formatter.flush();
        String json = stdout.toString();
        assertTrue(json.contains("\"success\": false"));
        assertTrue(json.contains("\"meta\""));
        assertTrue(json.contains("\"resolved\""));
        assertTrue(json.contains("\"USDT\""));
    }
}
