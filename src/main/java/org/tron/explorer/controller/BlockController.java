///*
// * java-tron is free software: you can redistribute it and/or modify
// * it under the terms of the GNU General Public License as published by
// * the Free Software Foundation, either version 3 of the License, or
// * (at your option) any later version.
// *
// * java-tron is distributed in the hope that it will be useful,
// * but WITHOUT ANY WARRANTY; without even the implied warranty of
// * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// * GNU General Public License for more details.
// *
// * You should have received a copy of the GNU General Public License
// * along with this program.  If not, see <http://www.gnu.org/licenses/>.
// */
//package org.tron.explorer.controller;
//
//import org.springframework.web.bind.annotation.RestController;
//import org.tron.protos.Protocol.Block;
//import org.tron.walletserver.WalletClient;
//
//@RestController
//public class BlockController {
//
//
////  @GetMapping("/getBlockByNumToView")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] getBlockByNumToView( long num) {
//    Block currentBlock = WalletClient.GetBlock(num);
//    return currentBlock.toByteArray();
//  }
//
////  @GetMapping("/getBlockToView")
//  /**
//   * @deprecated This function will be remove.The Wallet-cli will not provide HTTP services in the future.
//   */
//  public byte[] getBlockToView() {
//    Block currentBlock = WalletClient.GetBlock(-1);
//    if(currentBlock != null) {
//      return currentBlock.toByteArray();
//    }else{
//      return null;
//    }
//  }
//
//}
