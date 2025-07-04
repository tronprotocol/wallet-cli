package org.tron.walletcli;

import static org.apache.commons.lang3.StringUtils.isEmpty;
import static org.tron.common.utils.Utils.blueBoldHighlight;
import static org.tron.common.utils.Utils.greenBoldHighlight;

import com.typesafe.config.Config;
import org.tron.common.enums.NetType;
import org.tron.core.config.Configuration;
import org.tron.trident.core.ApiWrapper;

public class ApiClientFactory {
  private static String apiKey = null;

  static {
    Config config = Configuration.getByPath("config.conf");
    if (config.hasPath("grpc.mainnet.apiKey") && "mainnet".equalsIgnoreCase(config.getString("net.type"))) {
      apiKey = config.getString("grpc.mainnet.apiKey");
    }
  }

  public static ApiWrapper createClient(NetType type, String privateKey) {
    return createClient(type, privateKey, null, null);
  }

  public static ApiWrapper createClient(NetType type, String privateKey, String grpcEndpoint, String solidityGrpcEndpoint) {
    switch (type) {
      case MAIN:
        if (isEmpty(apiKey)) {
          System.out.println("Detected in config.conf that " + greenBoldHighlight("grpc.mainnet.apiKey")
              + " is not configured, API calls may be limited in speed. If you want a better "
              + "experience, please apply for the apiKey of the main network of " + blueBoldHighlight("Trongrid") +
              " and configure it in the config.conf.");
          return new ApiWrapper(type.getGrpc().getFullNode(), type.getGrpc().getSolidityNode(), privateKey);
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

