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
//import org.junit.Ignore;
//import org.junit.Test;
//import org.junit.runner.RunWith;
//import org.springframework.beans.factory.annotation.Autowired;
//import org.springframework.boot.test.context.SpringBootTest;
//import org.springframework.test.context.junit4.SpringJUnit4ClassRunner;
//import org.springframework.test.context.web.WebAppConfiguration;
//import org.tron.common.utils.ByteArray;
//import org.tron.explorer.GrpcClientApplication;
//import org.tron.protos.Protocol.Block;
//import org.tron.protos.Protocol.BlockHeader.raw;
//import org.tron.protos.Protocol.Transaction;
//
//@RunWith(SpringJUnit4ClassRunner.class)
//@SpringBootTest(classes=GrpcClientApplication.class)
//@WebAppConfiguration
//@Slf4j
//@Ignore
//public class BlockControllerTest {
//
//  @Autowired
//  BlockController blockController;
//
//
//
//  @Test
//  public void testGetBlockToView() {
//    final byte[] blockToView = blockController.getBlockToView();
//    try {
//      final Block block = Block.parseFrom(blockToView);
//      final raw rawData = block.getBlockHeader().getRawData();
//      final byte[] witnessAddress = rawData.getWitnessAddress().toByteArray();
//      final String address = ByteArray.toHexString(witnessAddress);
//      final long number = rawData.getNumber();
//      final long witnessId = rawData.getWitnessId();
//      final byte[] parentHash = rawData.getParentHash().toByteArray();
//      final String parentHashHex = ByteArray.toHexString(parentHash);
//
//      final List<Transaction> transactionsList = block.getTransactionsList();
//      transactionsList.forEach(transaction -> {
//        final int contractCount = transaction.getRawData().getContractCount();
//        log.info("contractCount is {}",contractCount);
//      });
//
//      log.info("witnessAddress is {}",address);
//      log.info("parentHashHex is {}",parentHashHex);
//      log.info("witnessId is {}",witnessId);
//      log.info("number is {}",number);
//
//    } catch (InvalidProtocolBufferException e) {
//      log.debug(e.getMessage(), e);
//    }
//
//  }
//}