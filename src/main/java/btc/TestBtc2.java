package btc;


import org.bitcoinj.core.ECKey;
import org.bitcoinj.core.NetworkParameters;
import org.bitcoinj.params.MainNetParams;

public class TestBtc2 {

  public static void main(String[] args) {
    while (true) {
      NetworkParameters params = MainNetParams.get();
      ECKey key = new ECKey();
      String privateKey = key.getPrivateKeyAsHex();
      String pubKey = key.getPublicKeyAsHex();
      String address = key.toAddress(params).toString();
      if (address.endsWith("Tron")) {
        System.out.format("privateKey => %s\n", privateKey);
        System.out.format("pubKey => %s\n", pubKey);
        System.out.format("address => %s\n", address);
      }
    }
  }

}
