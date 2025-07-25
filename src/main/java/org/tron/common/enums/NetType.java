package org.tron.common.enums;

import static org.tron.trident.core.Constant.FULLNODE_NILE;
import static org.tron.trident.core.Constant.FULLNODE_NILE_SOLIDITY;
import static org.tron.trident.core.Constant.TRONGRID_MAIN_NET;
import static org.tron.trident.core.Constant.TRONGRID_MAIN_NET_SOLIDITY;
import static org.tron.trident.core.Constant.TRONGRID_SHASTA;
import static org.tron.trident.core.Constant.TRONGRID_SHASTA_SOLIDITY;

import lombok.Getter;
import lombok.Setter;

@Getter
public enum NetType {
  MAIN(
      "https://api.trongrid.io",
      new Grpc(TRONGRID_MAIN_NET, TRONGRID_MAIN_NET_SOLIDITY),
      new GasFree(
          728126428L,
          "TFFAMQLZybALaLb4uxHA9RBE7pxhUAjF3U",
          "https://open.gasfree.io",
          "/tron")
  ),
  NILE("https://nile.trongrid.io",
      new Grpc(FULLNODE_NILE, FULLNODE_NILE_SOLIDITY),
      new GasFree(
          3448148188L,
          "THQGuFzL87ZqhxkgqYEryRAd7gqFqL5rdc",
          "https://open-test.gasfree.io",
          "/nile")
  ),
  SHASTA(
      "https://api.shasta.trongrid.io",
      new Grpc(TRONGRID_SHASTA, TRONGRID_SHASTA_SOLIDITY),
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


