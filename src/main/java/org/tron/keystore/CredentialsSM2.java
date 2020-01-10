package org.tron.keystore;

import org.tron.common.crypto.SignInterface;
import org.tron.common.crypto.sm2.SM2;
import org.tron.common.utils.ByteArray;
import org.tron.walletserver.WalletApi;

/**
 * Credentials wrapper.
 */
public class CredentialsSM2 implements Credentials {

    private final SM2 sm2Pair;
    private final String address;

    private CredentialsSM2(SM2 sm2Pair, String address) {
        this.sm2Pair = sm2Pair;
        this.address = address;
    }

//    public SM2 getEcKeyPair() {
//        return sm2Pair;
//    }

    public String getAddress() {
        return address;
    }

    public static CredentialsSM2 create(SM2 sm2Pair) {
        String address = WalletApi.encode58Check(sm2Pair.getAddress());
        return new CredentialsSM2(sm2Pair, address);
    }

    public static CredentialsSM2 create(String privateKey) {
        SM2 eCkey = SM2.fromPrivate(ByteArray.fromHexString(privateKey));
        return create(eCkey);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (o == null || getClass() != o.getClass()) {
            return false;
        }

        CredentialsSM2 that = (CredentialsSM2) o;

        if (sm2Pair != null ? !sm2Pair.equals(that.sm2Pair) : that.sm2Pair != null) {
            return false;
        }

        return address != null ? address.equals(that.address) : that.address == null;
    }

    @Override
    public int hashCode() {
        int result = sm2Pair != null ? sm2Pair.hashCode() : 0;
        result = 31 * result + (address != null ? address.hashCode() : 0);
        return result;
    }

    @Override
    public SignInterface getPair() {
        return sm2Pair;
    }
}
