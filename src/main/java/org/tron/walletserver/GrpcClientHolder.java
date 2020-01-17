package org.tron.walletserver;

public class GrpcClientHolder {

    private static GrpcClient grpcClient;
    private static byte prefix;

    public static GrpcClient getGrpcClient() {
        if (grpcClient == null) {
            throw new RuntimeException("Firstly you need to initialize grpc client in GrpcClientHolder.");
        }
        return grpcClient;
    }

    public static void setGrpcClient(GrpcClient grpcClient) {
        GrpcClientHolder.grpcClient = grpcClient;
    }

    public static byte getPrefix() {
        return prefix;
    }

    /**
     * {@link org.tron.core.config.Parameter.CommonConstant}
     * **/
    public static void setPrefix(byte prefix) {
        GrpcClientHolder.prefix = prefix;
    }
}
