package org.tron.explorer.controller;

import com.google.protobuf.Any;
import com.google.protobuf.InvalidProtocolBufferException;
import com.googlecode.protobuf.format.JsonFormat;
import io.swagger.annotations.ApiImplicitParam;
import io.swagger.annotations.ApiOperation;
import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Base64.Decoder;
import java.util.Base64.Encoder;
import java.util.List;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.ModelAndView;
import org.tron.common.utils.ByteArray;
import org.tron.explorer.domain.AccountVo;
import org.tron.explorer.domain.Address;
import org.tron.protos.Contract.AccountCreateContract;
import org.tron.protos.Contract.TransferContract;
import org.tron.protos.Protocol.Account;
import org.tron.protos.Protocol.AccountType;
import org.tron.protos.Protocol.Transaction;
import org.tron.protos.Protocol.Witness;
import org.tron.walletcli.Test;
import org.tron.walletserver.WalletClient;


@RestController
public class WitnessController {

  protected final Log log = LogFactory.getLog(getClass());

  @GetMapping("/queryWitness")
  public ModelAndView viewQueryWitness() {
    return new ModelAndView("witnessList");
  }

  @GetMapping("/createWitness")
  public ModelAndView viewCreateWitness() {
    return new ModelAndView("createWitness");
  }


  @GetMapping("/witnessList")
  public byte[] getWitnessList()
      throws IOException {

    List<Witness> objectList = WalletClient.listWitnesses().get().getWitnessesList();

    int objectsSize = 0;
    for (int i = 0; i < objectList.size(); i++) {
      Witness object = objectList.get(i);
      objectsSize += object.getSerializedSize();
      objectsSize += 2;  //Length
    }

    byte[] returnBytes = new byte[objectsSize];

    objectsSize = 0;
    for (int i = 0; i < objectList.size(); i++) {
      Witness object = objectList.get(i);
      byte[] objectBytes = object.toByteArray();
      int length = objectBytes.length;
      returnBytes[objectsSize++] = (byte) ((length & 0xFFFF) >> 8);
      returnBytes[objectsSize++] = (byte) (length & 0xFF);
      System.arraycopy(objectBytes, 0, returnBytes, objectsSize, length);
      objectsSize += length;
    }

    return returnBytes;
  }

  @PostMapping("/createWitnessToView")
  public byte[] getTransactionToView(String address, String onwerUrl) {
    Decoder decoder = Base64.getDecoder();
    byte[] owner = decoder.decode(address.getBytes());
    Transaction transaction = WalletClient.createWitnessTransaction(owner, onwerUrl.getBytes());
    return transaction.toByteArray();
  }



}
