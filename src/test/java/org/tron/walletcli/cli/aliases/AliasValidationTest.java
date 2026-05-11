package org.tron.walletcli.cli.aliases;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class AliasValidationTest {

    @Test
    public void acceptsTypicalNames() {
        AliasValidation.requireValidName("USDT");
        AliasValidation.requireValidName("alice");
        AliasValidation.requireValidName("hot-wallet");
        AliasValidation.requireValidName("v2.usdt");
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsBase58() {
        AliasValidation.requireValidName("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsHex() {
        AliasValidation.requireValidName("41a614f803b6fd780986a42c78ec9c7f77e6ded13c");
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsReserved() {
        AliasValidation.requireValidName("me");
    }

    @Test
    public void looksLikeAddressDistinguishesNames() {
        assertTrue(AliasValidation.looksLikeAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"));
        assertFalse(AliasValidation.looksLikeAddress("alice"));
    }
}
