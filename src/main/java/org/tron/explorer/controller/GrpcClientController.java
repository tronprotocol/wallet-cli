package org.tron.explorer.controller;

import com.google.protobuf.ByteString;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.ModelAndView;
import org.tron.common.utils.ByteArray;
import org.tron.explorer.service.GrpcClientService;
import org.tron.protos.Protocal.Account;


@RestController
public class GrpcClientController {

  protected final Log log = LogFactory.getLog(getClass());

  @Autowired
  private GrpcClientService grpcClientService;

  @GetMapping("/")
    public ModelAndView viewIndex() {
    return new ModelAndView("index");
  }

  // 4154ca3d1de87d61ab9f96891b6b2c359d6e8a94
  @RequestMapping("/balance/{address}")
    public String getBalance(@PathVariable(value ="address") String address) {
    Account account = Account.newBuilder().setAddress(ByteString
        .copyFrom(ByteArray.fromHexString(address))).build();
    return grpcClientService.getBalance(account).toString();
  }


}
