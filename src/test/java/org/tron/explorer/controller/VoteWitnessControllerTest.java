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
//import org.junit.Ignore;
//import org.junit.runner.RunWith;
//import org.springframework.beans.factory.annotation.Autowired;
//import org.springframework.boot.test.context.SpringBootTest;
//import org.springframework.test.context.junit4.SpringJUnit4ClassRunner;
//import org.springframework.test.context.web.WebAppConfiguration;
//import org.tron.api.GrpcAPI.WitnessList;
//import org.tron.common.utils.ByteArray;
//import org.tron.explorer.GrpcClientApplication;
//import org.junit.Test;
//
//@RunWith(SpringJUnit4ClassRunner.class)
//@SpringBootTest(classes=GrpcClientApplication.class)
//@WebAppConfiguration
//@Slf4j
//@Ignore
//public class VoteWitnessControllerTest {
//
//  @Autowired
//  VoteWitnessController voteWitnessController;
//
//  @Test
//  public void testGetVoteWitnessList() {
//    final byte[] voteWitnessList = voteWitnessController.getVoteWitnessList();
//    try {
//      final WitnessList list = WitnessList.parseFrom(voteWitnessList);
//      list.getWitnessesList().forEach(witness -> {
//
//        final byte[] witnessBytes = witness.getAddress().toByteArray();
//        final String witnessAddressHex = ByteArray.toHexString(witnessBytes);
//
//        final String url = witness.getUrl();
//        final long voteCount = witness.getVoteCount();
//        final long latestBlockNum = witness.getLatestBlockNum();
//
//        log.info("witnessAddressHex is {}",witnessAddressHex);
//        log.info("url is {}",url);
//        log.info("voteCount is {}",voteCount);
//        log.info("latestBlockNum is {}",latestBlockNum);
//        log.info("-------------------------");
//      });
//
//    } catch (InvalidProtocolBufferException e) {
//      log.debug(e.getMessage(), e);
//    }
//
//  }
//
//
//}