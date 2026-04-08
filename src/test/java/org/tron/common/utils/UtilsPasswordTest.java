package org.tron.common.utils;

import org.junit.Assert;
import org.junit.Test;
import org.tron.keystore.StringUtils;

public class UtilsPasswordTest {

  @Test
  public void resolveEnvPasswordRejectsWeakPasswordWhenStrengthCheckIsRequired() {
    try {
      Utils.resolveEnvPassword("a", true);
      Assert.fail("Expected weak MASTER_PASSWORD to be rejected");
    } catch (IllegalArgumentException e) {
      Assert.assertEquals("MASTER_PASSWORD does not meet password strength requirements",
          e.getMessage());
    }
  }

  @Test
  public void resolveEnvPasswordAcceptsWeakPasswordWhenStrengthCheckIsDisabled() {
    char[] password = Utils.resolveEnvPassword("a", false);
    try {
      Assert.assertArrayEquals(new char[]{'a'}, password);
    } finally {
      StringUtils.clear(password);
    }
  }

  @Test
  public void resolveEnvPasswordAcceptsStrongPasswordWhenStrengthCheckIsRequired() {
    char[] password = Utils.resolveEnvPassword("Abc12345!@", true);
    try {
      Assert.assertArrayEquals("Abc12345!@".toCharArray(), password);
    } finally {
      StringUtils.clear(password);
    }
  }
}
