package org.tron.explorer.controller;


import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.junit4.SpringJUnit4ClassRunner;
import org.springframework.test.context.web.WebAppConfiguration;
import org.tron.explorer.GrpcClientApplication;

@RunWith(SpringJUnit4ClassRunner.class)
@SpringBootTest(classes=GrpcClientApplication.class)
@WebAppConfiguration
public class AccountControllerTest {

  @Test
  public void queryAccount() {
  }

  @Test
  public void getAcountList() {
  }
}