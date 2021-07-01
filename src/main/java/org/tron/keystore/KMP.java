package org.tron.keystore;

public class KMP {
    public static boolean search(char[] text, char[] pattern) {
        int patternLength = pattern.length;
        int textLength = text.length;
        int[] lps = new int[patternLength];

        prepareLPSArray(pattern, lps);

        int i = 0;
        int j = 0;
        while (i < textLength) {
            if (text[i] == pattern[j]) {
                i++;
                j++;
            }

            if (j == patternLength) {
                return true;
            }

            if (i < textLength && text[i] != pattern[j]) {
                if (j != 0) {
                    j = lps[j - 1];
                } else {
                    i++;
                }
            }
        }
        return false;
    }

    private static void prepareLPSArray(char[] pattern, int lps[]) {
        int patternLength = pattern.length;
        int len = 0, i = 1;
        while (i < patternLength) {
            if (pattern[i] == pattern[len]) {
                len++;
                lps[i] = len;
                i++;
            } else {
                if (len == 0) {
                    lps[i] = len;
                    i++;
                } else {
                    len = lps[len - 1];
                }
            }
        }
    }
}