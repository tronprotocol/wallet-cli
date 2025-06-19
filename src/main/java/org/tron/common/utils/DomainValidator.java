package org.tron.common.utils;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.regex.Pattern;

public class DomainValidator {
  private static final Pattern DOMAIN_PATTERN = Pattern.compile(
      "^((?!-)[A-Za-z0-9-]{1,63}(?<!-)\\.)+" +
          "([A-Za-z]{2,63}|xn--[A-Za-z0-9]{1,59})$"
  );

  // IPv4
  private static final Pattern IPV4_PATTERN = Pattern.compile(
      "^((25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)(\\.|$)){4}$"
  );

  // IPv6
  public static boolean isIPv6(String input) {
    try {
      InetAddress address = InetAddress.getByName(input);
      return address.getHostAddress().contains(":");
    } catch (UnknownHostException e) {
      return false;
    }
  }

  public static boolean isIPv4(String input) {
    return IPV4_PATTERN.matcher(input).matches();
  }

  public static boolean isDomain(String input) {
    return DOMAIN_PATTERN.matcher(input).matches();
  }

  public static boolean isDomainOrIP(String input) {
    if (input == null || input.isEmpty()) return false;
    if ("localhost".equalsIgnoreCase(input)) return true;
    return isIPv4(input) || isDomain(input);
  }
}
