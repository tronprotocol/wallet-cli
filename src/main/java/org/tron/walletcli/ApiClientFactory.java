package org.tron.walletcli;

import org.tron.common.NetType;
import org.tron.trident.core.ApiWrapper;

public class ApiClientFactory {

  public static ApiWrapper createClient(NetType type, String privateKey) {
    return createClient(type, privateKey, null, null, null);
  }

  public static ApiWrapper createClient(NetType type, String privateKey, String apiKey) {
    return createClient(type, privateKey, apiKey, null, null);
  }

  public static ApiWrapper createClient(NetType type, String privateKey, String apiKey, String grpcEndpoint, String solidityGrpcEndpoint) {
    switch (type) {
      case MAIN:
        if (apiKey == null) {
          throw new IllegalArgumentException("API Key required for MAIN network");
        }
        return ApiWrapper.ofMainnet(privateKey, apiKey);
      case NILE:
        return ApiWrapper.ofNile(privateKey);
      case SHASTA:
        return ApiWrapper.ofShasta(privateKey);
      case CUSTOM:
        if (grpcEndpoint == null || solidityGrpcEndpoint == null) {
          throw new IllegalArgumentException("Custom endpoints required for CUSTOM network");
        }
        return new ApiWrapper(grpcEndpoint, solidityGrpcEndpoint, privateKey);
      default:
        throw new UnsupportedOperationException("Unknown network type: " + type);
    }
  }
}

