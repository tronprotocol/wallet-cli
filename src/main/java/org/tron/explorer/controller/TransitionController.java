package org.tron.explorer.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.tron.walletserver.WalletClient;

@RestController
public class TransitionController {
    @GetMapping("/getTotalTransition")
    public byte[] getTotalTransition(){
        return WalletClient.getTotalTransaction().toByteArray();
    }
}
