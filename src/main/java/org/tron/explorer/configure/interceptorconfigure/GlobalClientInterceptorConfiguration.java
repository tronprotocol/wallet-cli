package org.tron.explorer.configure.interceptorconfigure;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.tron.explorer.configure.autoconfigure.GlobalClientInterceptorConfigurerAdapter;
import org.tron.explorer.configure.autoconfigure.GlobalClientInterceptorRegistry;
import org.tron.explorer.loggerinterceptor.LogGrpcInterceptor;


@Order(Ordered.LOWEST_PRECEDENCE)
@Configuration
public class GlobalClientInterceptorConfiguration {

    @Bean
    public GlobalClientInterceptorConfigurerAdapter globalInterceptorConfigurerAdapter() {
        return new GlobalClientInterceptorConfigurerAdapter() {

            @Override
            public void addClientInterceptors(GlobalClientInterceptorRegistry registry) {
                registry.addClientInterceptors(new LogGrpcInterceptor());
            }
        };
    }

}