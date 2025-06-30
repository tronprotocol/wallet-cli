package org.tron.common.utils;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class CommandHelpUtil {
  private static final Map<String, CommandHelp> commandHelps = new HashMap<>();

  static {
    try {
      loadCommandExamples();
    } catch (IOException e) {
      System.out.println(e.getMessage());
    }
  }

  private static class CommandHelp {
    String syntax;
    String summary;
    List<String> examples = new ArrayList<>();

    @Override
    public String toString() {
      StringBuilder sb = new StringBuilder();
      sb.append("Syntax:\n").append(syntax);
      if (summary != null && !summary.isEmpty()) {
        sb.append("\nSummary:\n").append(summary);
      }
      sb.append("\nUsage examples:");
      for (String example : examples) {
        sb.append("\n").append(example);
      }
      return sb + "\n";
    }
  }

  public static void loadCommandExamples() throws IOException {
    InputStream inputStream = CommandHelpUtil.class.getResourceAsStream("/commands.txt");
    if (inputStream == null) {
      System.err.println("Cannot find commands.txt file");
      return;
    }
    try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream))) {
      String line;
      CommandHelp currentHelp = null;
      String currentSection = null;

      while ((line = reader.readLine()) != null) {
        if (line.startsWith("Syntax:")) {
          currentHelp = new CommandHelp();
          currentSection = "syntax";
        } else if (line.startsWith("Summary:")) {
          currentSection = "summary";
        } else if (line.startsWith("Usage example:")) {
          currentSection = "example";
        } else if (line.startsWith("wallet> ") && currentHelp != null) {
          currentHelp.examples.add(line);
          if (currentHelp.examples.size() == 1) {
            String command = line.substring("wallet> ".length()).split("\\s+")[0];
            commandHelps.put(command.toLowerCase(), currentHelp);
          }
        } else if (currentHelp != null && currentSection != null) {
          // 填充当前部分的文本
          switch (currentSection) {
            case "syntax":
              currentHelp.syntax = (currentHelp.syntax == null ? "" : currentHelp.syntax + "\n") + line;
              break;
            case "summary":
              currentHelp.summary = (currentHelp.summary == null ? "" : currentHelp.summary + "\n") + line;
              break;
          }
        }
      }
    }
  }

  public static String getCommandHelp(String command) {
    CommandHelp help = commandHelps.get(command);
    return help != null ? help.toString() : "No help found for command: " + command;
  }
}