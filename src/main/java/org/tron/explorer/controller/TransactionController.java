package org.tron.explorer.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.tron.walletserver.WalletClient;

@RestController
public class TransactionController {
    @GetMapping("/getTotalTransaction")
    public byte[] getTotalTransaction(){
        return WalletClient.getTotalTransaction().toByteArray();
    }
}
