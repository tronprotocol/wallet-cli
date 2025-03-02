package org.tron.ledger;

public class TronLedgerSignTrans {

  private TronLedgerSignTrans() {

  }

  private static class Holder {
    private static final TronLedgerSignTrans INSTANCE = new TronLedgerSignTrans();
  }

  public static TronLedgerSignTrans getInstance() {
    return TronLedgerSignTrans.Holder.INSTANCE;
  }

}
