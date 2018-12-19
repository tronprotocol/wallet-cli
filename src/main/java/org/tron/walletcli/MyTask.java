package org.tron.walletcli;


import org.tron.protos.Protocol.Transaction;
import org.tron.walletserver.GrpcClient;

public class MyTask implements Runnable {

  private int taskNum;
  private Transaction trans;
  private GrpcClient client;

  public MyTask(Transaction trans, GrpcClient client) {
    this.trans = trans;
    this.client = client;
  }

  @Override
  public void run() {
    client.broadcastTransaction(trans);
  }
}
