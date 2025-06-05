package org.tron.common.enums;

import lombok.Getter;
import lombok.Setter;

@Getter
public enum NetType {
  MAIN(
      "https://api.trongrid.io",
      new Grpc("grpc.trongrid.io:50051", "grpc.trongrid.io:50052"),
      new GasFree(
          728126428L,
          "TFFAMQLZybALaLb4uxHA9RBE7pxhUAjF3U",
          "https://open.gasfree.io",
          "/tron")
  ),
  NILE("https://nile.trongrid.io",
      new Grpc("grpc.nile.trongrid.io:50051", "grpc.nile.trongrid.io:50061"),
      new GasFree(
          3448148188L,
          "THQGuFzL87ZqhxkgqYEryRAd7gqFqL5rdc",
          "https://open-test.gasfree.io",
          "/nile")
  ),
  SHASTA(
      "https://api.shasta.trongrid.io",
      new Grpc("grpc.shasta.trongrid.io:50051", "grpc.shasta.trongrid.io:50052"),
      new GasFree(
          2494104990L,
          "TSwCtDum13k1PodgNgTWx5be7k1c6eWaNP",
          "https://open-test.gasfree.io",
          "/shasta")
  ),
  CUSTOM(null, null, null);

  private final String http;
  private final Grpc grpc;
  private final GasFree gasFree;

  NetType(String http, Grpc grpc, GasFree gasFree) {
    this.http = http;
    this.grpc = grpc;
    this.gasFree = gasFree;
  }

  @Setter
  @Getter
  public static class Grpc {
    public Grpc(String fullNode, String solidityNode) {
      this.fullNode = fullNode;
      this.solidityNode = solidityNode;
    }

    private String fullNode;
    private String solidityNode;
  }

  @Setter
  @Getter
  public static class GasFree {
    private long chainId;
    private String verifyingContract;
    private String httpUrl;
    private String apiPrefix;

    public GasFree(long chainId, String verifyingContract, String httpUrl, String apiPrefix) {
      this.chainId = chainId;
      this.verifyingContract = verifyingContract;
      this.httpUrl = httpUrl;
      this.apiPrefix = apiPrefix;
    }


  }
}


