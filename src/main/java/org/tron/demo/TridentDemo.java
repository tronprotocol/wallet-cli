package org.tron.demo;

import org.tron.trident.core.ApiWrapper;
import org.tron.trident.core.exceptions.IllegalException;
import org.tron.trident.proto.Response;

public class TridentDemo {
  public static void main(String[] args) throws IllegalException {

    String grpcEndpoint = "127.0.0.1:50051";
    String grpcEndpointSolidity = "127.0.0.1:50051";
    String hexPrivateKey = "02d6a8b346d6201f037d144a70255db11e285184b656d58274570fb8619edd1e";

    String address = "TK49XBrpueBABptoC9FsNuAvBCeL9WkC9i";

    ApiWrapper wrapper = new ApiWrapper(grpcEndpoint, grpcEndpointSolidity, hexPrivateKey);


    System.out.println("end");
  }
}
