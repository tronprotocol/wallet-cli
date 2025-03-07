package org.tron.common.utils;

import java.io.IOException;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.Paths;

public class PathUtil {
  public static String toAbsolutePath(String inputPath) throws IOException {
    if (inputPath == null || inputPath.trim().isEmpty()) {
      throw new IllegalArgumentException("Input path cannot be null or empty");
    }
    try {
      Path path = Paths.get(inputPath);
      if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
        String userHome = System.getProperty("user.home");
        path = Paths.get(userHome, inputPath.substring(2));
      }
      Path absolutePath = path.toAbsolutePath().normalize();
      return absolutePath.toString();
    } catch (InvalidPathException e) {
      throw new IOException("Invalid path: " + inputPath, e);
    }
  }

  public static String getTempDirectoryPath() {
    String osName = System.getProperty("os.name").toLowerCase();

    if (osName.contains("win")) {
      return System.getenv("TEMP");
    } else if (osName.contains("mac") || osName.contains("nix") || osName.contains("nux")) {
      return "/tmp";
    } else {
      throw new UnsupportedOperationException("Unsupported operating system: " + osName);
    }
  }
}
