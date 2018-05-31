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
//import org.tron.protos.Contract.WitnessCreateContract;
//import org.tron.protos.Protocol.Transaction;
//
//@RunWith(SpringJUnit4ClassRunner.class)
//@SpringBootTest(classes=GrpcClientApplication.class)
//@WebAppConfiguration
//@Slf4j
//@Ignore
//public class WitnessControllerTest {
//
//  @Autowired
//  WitnessController witnessController;
//
//  @Test
//  public void testGetTransactionToView() {
//
//    String address = CommonConstant.ADD_PRE_FIX_STRING +"8a164d6e6d3d4dd6f9f6b8b6460a7e63bb3bb96d";
//    String onwerUrl = "http://Mercury.org";
//
//    final byte[] transactionToView = witnessController.getTransactionToView(address, onwerUrl);
//    try {
//      final Transaction transaction = Transaction.parseFrom(transactionToView);
//
//      transaction.getRawData().getContractList().forEach(contract -> {
//        try {
//
//          final WitnessCreateContract witnessCreateContract = contract.getParameter()
//              .unpack(WitnessCreateContract.class);
//          final byte[] addressBytes = witnessCreateContract.getOwnerAddress().toByteArray();
//          final String addressHex = ByteArray.toHexString(addressBytes);
//          final String url = witnessCreateContract.getUrl().toStringUtf8();
//
//          log.info("-------------------------------");
//          log.info("witnessAddress is {}",addressHex);
//          log.info("url is {}",url);
//          log.info("-------------------------------");
//
//          Assert.assertEquals(address,addressHex);
//          Assert.assertEquals(onwerUrl,url);
//
//        } catch (InvalidProtocolBufferException e) {
//          log.debug(e.getMessage(), e);
//        }
//      });
//    } catch (InvalidProtocolBufferException e) {
//      log.debug(e.getMessage(), e);
//    }
//
//  }
//}