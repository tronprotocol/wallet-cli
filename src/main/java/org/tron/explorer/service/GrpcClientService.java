package org.tron.explorer.service;

import io.grpc.Channel;
import org.springframework.stereotype.Service;
import org.tron.api.WalletGrpc;
import org.tron.api.WalletGrpc.WalletBlockingStub;
import org.tron.protos.Protocal.Account;
import org.tron.explorer.configure.autoconfigure.GrpcClient;

@Service
public class GrpcClientService {

    @GrpcClient("local-grpc-server")
    private Channel serverChannel;

    public Account getBalance(Account account) {
        WalletBlockingStub walletBlockingStub = WalletGrpc.newBlockingStub(serverChannel);
        Account balance = walletBlockingStub.getBalance(account);
        return balance;
    }
}
