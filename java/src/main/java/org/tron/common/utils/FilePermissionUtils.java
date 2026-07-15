package org.tron.common.utils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.util.EnumSet;
import java.util.Set;

public final class FilePermissionUtils {

  private FilePermissionUtils() {}

  /**
   * Set owner-only read/write permissions (0600) on a file.
   * Skips silently on non-POSIX filesystems.
   */
  public static void setOwnerOnlyFile(Path path) throws IOException {
    try {
      Set<PosixFilePermission> perms = EnumSet.of(
          PosixFilePermission.OWNER_READ,
          PosixFilePermission.OWNER_WRITE);
      Files.setPosixFilePermissions(path, perms);
    } catch (UnsupportedOperationException e) {
      // Non-POSIX filesystem (e.g. Windows), skip
    }
  }

  /**
   * Set owner-only read/write/execute permissions (0700) on a directory.
   * Skips silently on non-POSIX filesystems.
   */
  public static void setOwnerOnlyDirectory(Path path) throws IOException {
    try {
      Set<PosixFilePermission> perms = EnumSet.of(
          PosixFilePermission.OWNER_READ,
          PosixFilePermission.OWNER_WRITE,
          PosixFilePermission.OWNER_EXECUTE);
      Files.setPosixFilePermissions(path, perms);
    } catch (UnsupportedOperationException e) {
      // Non-POSIX filesystem (e.g. Windows), skip
    }
  }
}
