package org.tron.walletcli;

import java.util.Arrays;
import java.util.List;
import org.junit.Assert;
import org.junit.Test;
import org.tron.common.crypto.ECKey;
import org.tron.common.utils.ByteArray;
import org.tron.mnemonic.MnemonicUtils;
import org.tron.walletserver.WalletApi;

/**
 * Deterministic crypto test vectors for core wallet operations.
 * Expected values are pre-computed and hardcoded — do not derive them dynamically.
 */
public class CryptoVectorTest {

    @Test
    public void privateKeyToTronAddress() {
        byte[] privKey = ByteArray.fromHexString(
            "afdfd9c3d2095ef696594f6cedcae59e72dcd697e2a7521b1578140422a4f890");
        ECKey ecKey = ECKey.fromPrivate(privKey);
        String address = WalletApi.encode58Check(ecKey.getAddress());
        Assert.assertEquals("TAaQhg316jEzoL9JojWFMUhoguXrSd7Fqd", address);
    }

    @Test
    public void mnemonicToTronAddress() {
        List<String> mnemonic = Arrays.asList(
            "abandon", "abandon", "abandon", "abandon", "abandon", "abandon",
            "abandon", "abandon", "abandon", "abandon", "abandon", "about");
        byte[] privKey = MnemonicUtils.getPrivateKeyFromMnemonic(mnemonic);
        Assert.assertEquals(
            "b5a4cea271ff424d7c31dc12a3e43e401df7a40d7412a15750f3f0b6b5449a28",
            ByteArray.toHexString(privKey));
        ECKey ecKey = ECKey.fromPrivate(privKey);
        String address = WalletApi.encode58Check(ecKey.getAddress());
        Assert.assertEquals("TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH", address);
    }
}
