package org.tron.explorer.configure.autoconfigure;

import io.grpc.Channel;
import io.grpc.ClientInterceptor;
import java.util.List;


public interface GrpcChannelFactory {

    Channel createChannel(String name);

    Channel createChannel(String name, List<ClientInterceptor> interceptors);
}
