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
//import java.io.IOException;
//import java.util.List;
//import lombok.extern.slf4j.Slf4j;
//import org.junit.Ignore;
//import org.junit.Test;
//import org.junit.runner.RunWith;
//import org.springframework.beans.factory.annotation.Autowired;
//import org.springframework.boot.test.context.SpringBootTest;
//import org.springframework.test.context.junit4.SpringJUnit4ClassRunner;
//import org.springframework.test.context.web.WebAppConfiguration;
//import org.tron.api.GrpcAPI.AssetIssueList;
//import org.tron.common.utils.ByteArray;
//import org.tron.explorer.GrpcClientApplication;
//import org.tron.protos.Contract.AssetIssueContract;
//
//@RunWith(SpringJUnit4ClassRunner.class)
//@SpringBootTest(classes=GrpcClientApplication.class)
//@WebAppConfiguration
//@Slf4j
//@Ignore
//public class AssetIssueControllerTest {
//
//  @Autowired
//  AssetIssueController assetIssueController;
//
//  @Test
//  public void testGetAssetIssueList() {
//    try {
//      final byte[] assetIssueList = assetIssueController.getAssetIssueList();
//      final List<AssetIssueContract> assetsIssueList = AssetIssueList.parseFrom(assetIssueList)
//          .getAssetIssueList();
//
//      assetsIssueList.forEach(assetIssue -> {
//        final byte[] addressBytes = assetIssue.getOwnerAddress().toByteArray();
//        final String addressHex = ByteArray.toHexString(addressBytes);
//        final String name = assetIssue.getName().toStringUtf8();
//        final int trxNum = assetIssue.getTrxNum();
//        final long totalSupply = assetIssue.getTotalSupply();
//
//        log.info("addressHex  is {}",addressHex);
//        log.info("assetIssue name  is {}",name);
//        log.info("trxNum  is {}",trxNum);
//        log.info("totalSupply  is {}",totalSupply);
//
//      });
//
//
//    } catch (IOException e) {
//      log.debug(e.getMessage(), e);
//    }
//  }
//
//
//}