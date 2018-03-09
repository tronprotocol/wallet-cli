package org.tron.explorer.service;

import io.grpc.Channel;
import org.springframework.stereotype.Service;
import org.tron.api.WalletGrpc;
import org.tron.api.WalletGrpc.WalletBlockingStub;
import org.tron.explorer.configure.autoconfigure.GrpcClient;
import org.tron.protos.Protocol.Account;


@Service
public class GrpcClientService {

    @GrpcClient("local-grpc-server")
    private Channel serverChannel;

    public Long getBalance(Account account) {
        WalletBlockingStub walletBlockingStub = WalletGrpc.newBlockingStub(serverChannel);
        long balance = walletBlockingStub.getBalance(account).getBalance();
        return balance;
    }
}
