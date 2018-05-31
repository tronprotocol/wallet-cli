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
//import java.util.List;
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
//import org.tron.protos.Protocol.Account;
//
//
//@RunWith(SpringJUnit4ClassRunner.class)
//@SpringBootTest(classes=GrpcClientApplication.class)
//@WebAppConfiguration
//@Slf4j
//@Ignore
//public class AccountControllerTest {
//
//  @Autowired
//  AccountController accountController;
//
//  @Test
//  public void testQueryAccount() {
//    String address = CommonConstant.ADD_PRE_FIX_STRING +"55ddae14564f82d5b94c7a131b5fcfd31ad6515a";
//    final byte[] account = accountController.queryAccount(address);
//
//    try {
//      final Account accountParseFrom = Account.parseFrom(account);
//
//      final String accountName = accountParseFrom.getAccountName().toStringUtf8();
//      Assert.assertEquals("Zion",accountName);
//
//      final byte[] addressBytes = accountParseFrom.getAddress().toByteArray();
//      final String addressHex = ByteArray.toHexString(addressBytes);
//      Assert.assertEquals(CommonConstant.ADD_PRE_FIX_STRING +"55ddae14564f82d5b94c7a131b5fcfd31ad6515a",addressHex);
//
//      final long balance = accountParseFrom.getBalance();
//      Assert.assertEquals(balance,balance);
//
//    } catch (InvalidProtocolBufferException e) {
//      log.debug(e.getMessage(), e);
//    }
//
//  }
////
////  @Test
////  public void testGetAcountList() {
////    final byte[] acountList = accountController.getAcountList();
////    try {
////      final AccountList accountListParseFrom = AccountList.parseFrom(acountList);
////      final List<Account> accountsList = accountListParseFrom.getAccountsList();
////
////      accountsList.forEach( account -> {
////        final String accountName = account.getAccountName().toStringUtf8();
////        final byte[] addressBytes = account.getAddress().toByteArray();
////        final String addressHex = ByteArray.toHexString(addressBytes);
////        final long balance = account.getBalance();
////
////        log.info("accountName  is : {}",accountName);
////        log.info("addressHex  is : {}",addressHex);
////        log.info("balance  is ：{} ",balance);
////        log.info("----------------------");
////      });
////
////    } catch (InvalidProtocolBufferException e) {
////      log.debug(e.getMessage(), e);
////    }
////  }
//
//}