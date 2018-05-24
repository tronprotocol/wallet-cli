package org.tron.explorer.controller;

//
//@RestController
//public class AccountController {
//
//  protected final Log log = LogFactory.getLog(getClass());
//
//  @ModelAttribute
//  AccountVo setAccountVo() {
//    return new AccountVo();
//  }
//
// // @PostMapping("/queryAccount")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] queryAccount(String address) {
//    try {
//      if (address == null) {
//        return null;
//      }
//      byte[] baAddress = WalletClient.decodeFromBase58Check(address);
//      if (baAddress == null) {
//        return null;
//      }
//      Account account = WalletClient.queryAccount(baAddress);
//      return account.toByteArray();
//    } catch (Exception e) {
//      e.printStackTrace();
//      return null;
//    }
//  }
//
////  @GetMapping("/accountList")
////  /**
////   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
////   */
////  public byte[] getAcountList() {
////    try {
////      Optional<AccountList> result = WalletClient.listAccounts();
////      if (result.isPresent()) {
////        AccountList accountList = result.get();
////        return accountList.toByteArray();
////      }
////    } catch (Exception e) {
////      e.printStackTrace();
////    }
////    return null;
////  }
//
//  //@GetMapping("/updateAccount")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public ModelAndView viewCreateWitness() {
//    return new ModelAndView("updateAccount");
//  }
//
//
// // @PostMapping("/updateAccountToView")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] updateAccount(@ModelAttribute AccountVo account) {
//    String address = account.getAddress();
//    String accountName = account.getName();
//
//    try {
//      if (address == null || accountName == null) {
//        return null;
//      }
//      byte[] addressBytes = WalletClient.decodeFromBase58Check(address);
//      byte[] nameBytes = accountName.getBytes();
//      if (addressBytes == null) {
//        return null;
//      }
//
//      Transaction transaction = WalletClient.updateAccountTransaction(addressBytes, nameBytes);
//      transaction = TransactionUtils.setTimestamp(transaction);
//      return transaction.toByteArray();
//    } catch (Exception e) {
//      e.printStackTrace();
//      return null;
//    }
//  }
//}