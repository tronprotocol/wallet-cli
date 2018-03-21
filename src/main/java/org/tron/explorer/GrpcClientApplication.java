package org.tron.explorer;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.support.SpringBootServletInitializer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.converter.protobuf.ProtobufHttpMessageConverter;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;



@EnableScheduling
@SpringBootApplication
public class GrpcClientApplication extends SpringBootServletInitializer {


    @Bean
    ProtobufHttpMessageConverter protobufHttpMessageConverter() {
        return new ProtobufHttpMessageConverter();
    }


    //fix cors
    @Configuration
    public class CorsConfig {
        private CorsConfiguration buildConfig() {
            CorsConfiguration corsConfiguration = new CorsConfiguration();
            corsConfiguration.addAllowedOrigin("*"); // 1
            corsConfiguration.addAllowedHeader("*"); // 2
            corsConfiguration.addAllowedMethod("*"); // 3
            return corsConfiguration;
        }

        @Bean
        public CorsFilter corsFilter() {
            UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
            source.registerCorsConfiguration("/**", buildConfig()); // 4
            return new CorsFilter(source);
        }

    }

    protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
        return application.sources(GrpcClientApplication.class);
    }


    public static void main(String[] args) {
        SpringApplication.run(GrpcClientApplication.class, args);
    }

}


