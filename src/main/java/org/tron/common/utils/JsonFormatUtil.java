package org.tron.common.utils;

public class JsonFormatUtil {

  /**
   * format json string to show type
   */
  public static String formatJson(String jsonStr) {
    if (null == jsonStr || "".equals(jsonStr)) {
      return "";
    }
    StringBuilder sb = new StringBuilder();
    int indent = 0;
    boolean inString = false;
    boolean escaped = false;
    for (int i = 0; i < jsonStr.length(); i++) {
      char c = jsonStr.charAt(i);
      if (escaped) {
        escaped = false;
        sb.append(c);
        continue;
      }
      if (c == '\\' && inString) {
        escaped = true;
        sb.append(c);
        continue;
      }
      if (c == '"') {
        inString = !inString;
        sb.append(c);
        continue;
      }
      if (inString) {
        sb.append(c);
        continue;
      }
      switch (c) {
        case '{':
        case '[':
          sb.append(c);
          sb.append('\n');
          indent++;
          addIndentBlank(sb, indent);
          break;
        case '}':
        case ']':
          sb.append('\n');
          indent--;
          addIndentBlank(sb, indent);
          sb.append(c);
          break;
        case ',':
          sb.append(c);
          sb.append('\n');
          addIndentBlank(sb, indent);
          break;
        default:
          sb.append(c);
      }
    }

    return sb.toString();
  }

  /**
   * add space
   */
  private static void addIndentBlank(StringBuilder sb, int indent) {
    for (int i = 0; i < indent; i++) {
      sb.append('\t');
    }
  }
}
