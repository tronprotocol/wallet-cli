package org.tron.explorer.controller;



import io.swagger.annotations.ApiImplicitParam;
import io.swagger.annotations.ApiOperation;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.ModelAndView;
import org.tron.common.utils.ByteArray;
import org.tron.explorer.domain.Account;
import org.tron.walletserver.WalletClient;


@RestController
public class GrpcClientController {

  protected final Log log = LogFactory.getLog(getClass());


  @GetMapping("/")
  public ModelAndView viewIndex() {
    return new ModelAndView("index");
  }


  @ModelAttribute
  Account setAccount () {
    return new Account ();
  }

  @ApiOperation(value="get Balance", notes="query balance")
  @ApiImplicitParam(name = "address", value = "address", required = true, dataType = "String")

  @PostMapping("/balance")
  public ModelAndView getBalance(@ModelAttribute Account account) {

    long balance = WalletClient.getBalance(ByteArray.fromHexString(account.getAddress()));
    ModelAndView modelAndView = new ModelAndView("balance");
    modelAndView.addObject("address",account.address);
    modelAndView.addObject("balance",balance);

    return modelAndView;
  }

}
