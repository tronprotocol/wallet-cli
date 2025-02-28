package org.tron.ledger.listener;

import org.hid4java.HidDevice;
import org.hid4java.HidException;
import org.hid4java.HidManager;
import org.hid4java.HidServices;
import org.hid4java.HidServicesSpecification;
import org.hid4java.event.HidServicesEvent;
import org.tron.common.crypto.Hash;
import org.tron.common.crypto.Sha256Sm3Hash;
import org.tron.ledger.sdk.ApduExchangeHandler;
import org.tron.ledger.sdk.ApduMessageBuilder;
import org.tron.ledger.sdk.CommonUtil;
import org.tron.ledger.sdk.LedgerProtocol;
import org.tron.protos.Protocol;
import org.tron.walletserver.WalletApi;

import java.util.Arrays;

import static org.tron.ledger.sdk.CommonUtil.bytesToHex;
import static org.tron.ledger.sdk.CommonUtil.hexStringToByteArray;
import static org.tron.ledger.sdk.LedgerConstant.LEDGER_SIGN_CANCEL;

public class LedgerSignListener extends BaseListener {

  public void executeSignListen(Protocol.Transaction transaction) throws HidException {
    HidServicesSpecification hidServicesSpecification = new HidServicesSpecification();
    // hidServicesSpecification need the same in the program
    hidServicesSpecification.setAutoStart(false);
    hidServicesSpecification.setAutoDataRead(true);
    hidServicesSpecification.setDataReadInterval(500);

    HidServices hidServices = HidManager.getHidServices(hidServicesSpecification);

    hidServices.addHidServicesListener(this);

    hidServices.start();

    HidDevice fidoDevice = null;
    for (HidDevice hidDevice : hidServices.getAttachedHidDevices()) {
      if ( hidDevice.getVendorId() == 0x2c97) {
        fidoDevice = hidDevice;
        break;
      }
    }

    if (fidoDevice == null) {
      System.out.println(ANSI_YELLOW + "No FIDO2 devices attached." + ANSI_RESET);
    } else {
      if (fidoDevice.isClosed()) {
        if (!fidoDevice.open()) {
          throw new IllegalStateException("Unable to open device");
        }
      }
      byte[] sendResult = handleTransSign(fidoDevice, transaction);
      if (sendResult == null) {
        System.out.println("transaction sign request is sent to ledger");
        System.out.println("you can input y to cancel or just operate on ledger");
      }
    }
    waitAndShutdown(hidServices);
  }

  public byte[] handleTransSign(HidDevice hidDevice, Protocol.Transaction transaction) {
    String transactionRaw = bytesToHex(transaction.getRawData().toByteArray());
    String path = "m/44'/195'/0'/0/0";
    byte[] apdu = ApduMessageBuilder.buildTransactionSignApduMessage(path, transactionRaw);
    return ApduExchangeHandler.exchangeApdu(hidDevice, apdu);
  }

  @Override
  public void hidDataReceived(HidServicesEvent event) {
    super.hidDataReceived(event);
    final int CHANNEL = 0x0101;
    final int PACKET_SIZE = 64;
    byte[] response = event.getDataReceived();
    //System.out.println("Response: " + bytesToHex(response));
    byte[] unwrappedResponse = LedgerProtocol.unwrapResponseAPDU(
        CHANNEL, response, PACKET_SIZE, false);

    if (LEDGER_SIGN_CANCEL.equalsIgnoreCase(CommonUtil.bytesToHex(unwrappedResponse))) {
      System.out.println("cancel sign from ledger");
      TransactionSignManager.getInstance().setTransaction(null);
      return;
    } else {
      System.out.println("confirm sign from ledger");
      byte[] signature = Arrays.copyOfRange(unwrappedResponse, 0, 65);
      TransactionSignManager.getInstance().addTransactionSign(signature);
      Protocol.Transaction transaction = TransactionSignManager.getInstance().getTransaction();
      boolean ret = WalletApi.broadcastTransaction(transaction);
      if (ret) {
        System.out.println("BroadcastTransaction successful !!!");
      } else {
        System.out.println("BroadcastTransaction failed !!!");
      }
    }
  }


  public byte[] generateContractAddress(byte[] ownerAddress, Protocol.Transaction trx) {
    // get tx hash
    byte[] txRawDataHash = Sha256Sm3Hash.of(trx.getRawData().toByteArray()).getBytes();

    // combine
    byte[] combined = new byte[txRawDataHash.length + ownerAddress.length];
    System.arraycopy(txRawDataHash, 0, combined, 0, txRawDataHash.length);
    System.arraycopy(ownerAddress, 0, combined, txRawDataHash.length, ownerAddress.length);

    return Hash.sha3omit12(combined);
  }


  public static void main(String[] args) {
    try {
      String s = "0a6a5a68080112640a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412330a15410547286e6b520b6e77df7a6b1c4d2184d04866d3121541ccf2f3d3d97bb7dc6d89353bd2b5a956eda5c4ad18c090b82a";
      byte [ ] data = hexStringToByteArray(s);
      Protocol.Transaction transaction  =  Protocol.Transaction.parseFrom(data);

      LedgerSignListener listener = new LedgerSignListener();
      listener.executeSignListen(transaction);
    } catch (Exception e) {
      e.printStackTrace();
    }

  }


}
