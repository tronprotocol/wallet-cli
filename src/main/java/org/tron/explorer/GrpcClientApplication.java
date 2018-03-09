package org.tron.explorer;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategy;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.mitchellbosecke.pebble.PebbleEngine;
import com.mitchellbosecke.pebble.extension.AbstractExtension;
import com.mitchellbosecke.pebble.extension.Extension;
import com.mitchellbosecke.pebble.extension.Filter;
import com.mitchellbosecke.pebble.loader.ClasspathLoader;
import com.mitchellbosecke.pebble.spring4.PebbleViewResolver;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurerAdapter;


@EnableScheduling
@SpringBootApplication
public class GrpcClientApplication {
  @Value("${pebble.cache:false}")
  boolean pebbleCache;


  @Bean
    public PebbleViewResolver pebbleViewResolver() {
    PebbleViewResolver viewResolver = new PebbleViewResolver();
    viewResolver.setPrefix("templates/");
    viewResolver.setSuffix("");
    viewResolver.setPebbleEngine(
        new PebbleEngine.Builder().cacheActive(pebbleCache).loader(new ClasspathLoader())
                .build());
    return viewResolver;
  }


  @Bean
    public ObjectMapper objectMapper() {
    final ObjectMapper mapper = new ObjectMapper();
    mapper.setPropertyNamingStrategy(PropertyNamingStrategy.SNAKE_CASE);
    // disabled features:
    mapper.disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    mapper.disable(SerializationFeature.FAIL_ON_EMPTY_BEANS);
    mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    return mapper;
  }

  @Autowired
  ObjectMapper objectMapper;

  @Bean
  public WebMvcConfigurer webMvcConfigurer() {
    return new WebMvcConfigurerAdapter() {
          /**
           * Keep "/static/**" prefix.
           */
          @Override
            public void addResourceHandlers(ResourceHandlerRegistry registry) {
            super.addResourceHandlers(registry);
            registry.addResourceHandler("/static/**")
            .addResourceLocations("classpath:/static/");
        }

            /**
             * Add Java8 time support for Jackson.
             */
            @Override
            public void configureMessageConverters(List<HttpMessageConverter<?>> converters) {
                final MappingJackson2HttpMessageConverter converter = new MappingJackson2HttpMessageConverter();
                converter.setObjectMapper(objectMapper);
                converters.add(converter);
                super.configureMessageConverters(converters);
            }
        };
    }

    public static void main(String[] args) {
        SpringApplication.run(GrpcClientApplication.class, args);
    }

}


