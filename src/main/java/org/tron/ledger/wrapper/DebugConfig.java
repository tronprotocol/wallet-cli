package org.tron.ledger.wrapper;

import com.typesafe.config.Config;
import org.tron.core.config.Configuration;

public class DebugConfig {
  private static DebugConfig instance;
  private boolean debugEnabled = false;

  private DebugConfig() {
    Config config = Configuration.getByPath("config.conf");
    if (config.hasPath("ledger_debug")) {
      debugEnabled = config.getBoolean("ledger_debug");
    }
  }

  public static synchronized DebugConfig getInstance() {
    if (instance == null) {
      instance = new DebugConfig();
    }
    return instance;
  }

  public static boolean isDebugEnabled() {
    return DebugConfig.getInstance().debugEnabled;
  }
}
