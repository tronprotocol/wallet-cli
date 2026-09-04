package org.tron.walletcli;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.lang.reflect.Field;
import java.util.regex.Pattern;
import org.junit.Test;
import org.tron.common.utils.Utils;

public class StandardCliRemovedHintTest {

  private static final Pattern URL_PATTERN =
      Pattern.compile("^https://github\\.com/tronprotocol/wallet-cli/blob/[^/\\s]+/\\S+$");

  @Test
  public void hintCarriesARunnableCommandALiveLinkAndTheVersion() throws Exception {
    Field field = Client.class.getDeclaredField("STANDARD_CLI_REMOVED_HINT");
    field.setAccessible(true);
    String hint = (String) field.get(null);

    String[] lines = hint.split("\n", -1);

    // Every line must be self-contained: readable on its own, since a user may
    // only see the last line of the output.
    assertTrue("expected at least a version line, a command line and a link line",
        lines.length >= 3);

    // The version must still be present, matching Utils.VERSION.
    assertTrue("hint must contain the current CLI version",
        hint.contains(Utils.VERSION.trim()));

    // There must be a copy-pasteable command that runs the TypeScript CLI via npx,
    // not just a bare package name.
    boolean hasRunnableCommand = false;
    for (String line : lines) {
      if (line.contains("npx @tron-walletcli/wallet-cli")) {
        hasRunnableCommand = true;
      }
    }
    assertTrue("hint must contain a runnable `npx @tron-walletcli/wallet-cli ...` command",
        hasRunnableCommand);

    // If a link is present, it must point at a real, branch-rename-proof location
    // (the HEAD alias) rather than a hardcoded branch name.
    boolean hasLink = false;
    for (String line : lines) {
      String candidate = line;
      int urlStart = candidate.indexOf("https://");
      if (urlStart >= 0) {
        hasLink = true;
        String url = candidate.substring(urlStart).trim();
        assertTrue("link must match the expected github.com blob URL shape: " + url,
            URL_PATTERN.matcher(url).matches());
        assertTrue("link must use the HEAD ref alias so it survives a default-branch rename",
            url.contains("/blob/HEAD/"));
      }
    }
    assertTrue("hint should point at a real, existing document", hasLink);

    // Each line must stand on its own: non-blank, and no stray leading/trailing whitespace.
    for (String line : lines) {
      assertEquals(line, line.trim());
      assertTrue("line must not be blank: [" + hint + "]", line.length() > 0);
    }
  }
}
