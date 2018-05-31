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
//import com.google.protobuf.InvalidProtocolBufferException;
//import lombok.extern.slf4j.Slf4j;
//import org.junit.Assert;
//import org.junit.Ignore;
//import org.junit.Test;
//import org.junit.runner.RunWith;
//import org.springframework.beans.factory.annotation.Autowired;
//import org.springframework.boot.test.context.SpringBootTest;
//import org.springframework.test.context.junit4.SpringJUnit4ClassRunner;
//import org.springframework.test.context.web.WebAppConfiguration;
//import org.tron.common.utils.ByteArray;
//import Parameter.CommonConstant;
//import org.tron.explorer.GrpcClientApplication;
//import org.tron.explorer.domain.Transfer;
//import org.tron.protos.Contract.TransferContract;
//import org.tron.protos.Protocol.Transaction;
//
//@RunWith(SpringJUnit4ClassRunner.class)
//@SpringBootTest(classes=GrpcClientApplication.class)
//@WebAppConfiguration
//@Slf4j
//@Ignore
//public class TransferControllerTest {
//
//  @Autowired
//  TransferController transferController;
//
//  @Test
//  public void testGetTransactionToView() {
//    Transfer transfer = new Transfer();
//    String address= (CommonConstant.ADD_PRE_FIX_STRING +"4948C2E8A756D9437037DCD8C7E0C73D560CA38D").toLowerCase();
//    String toAddress= (CommonConstant.ADD_PRE_FIX_STRING +"ABD4B9367799EAA3197FECB144EB71DE1E049150").toLowerCase();
//    transfer.setAddress(address);
//    transfer.setToAddress(toAddress);
//
//    transfer.setAmount("1");
//
//    final byte[] transactionToView = transferController.getTransactionToView(transfer);
//
//    try {
//
//      final Transaction transaction = Transaction.parseFrom(transactionToView);
//      transaction.getRawData().getContractList().forEach(contract -> {
//
//        try {
//          final TransferContract transferContract = contract.getParameter().
//              unpack(TransferContract.class);
//          final byte[] addressBytes = transferContract.getOwnerAddress().toByteArray();
//          final String addressHex = ByteArray.toHexString(addressBytes);
//          final byte[] toAddressBytes = transferContract.getToAddress().toByteArray();
//          final String toAddressHex = ByteArray.toHexString(toAddressBytes);
//          final long amount = transferContract.getAmount();
//
//          Assert.assertEquals(address,addressHex);
//          Assert.assertEquals(toAddress,toAddressHex);
//          Assert.assertEquals(1L,amount);
//
//
//        } catch (InvalidProtocolBufferException e) {
//          log.debug(e.getMessage(), e);
//        }
//
//      });
//    } catch (InvalidProtocolBufferException e) {
//      log.debug(e.getMessage(), e);
//    }
//  }
//}