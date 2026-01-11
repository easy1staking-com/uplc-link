package com.easy1staking.plutusscan.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

/**
 * OpenAPI/Swagger Configuration
 * Provides interactive API documentation at /swagger-ui.html
 */
@Configuration
public class OpenApiConfig {

    @Value("${server.port:8080}")
    private String serverPort;

    @Bean
    public OpenAPI uplcLinkOpenAPI() {
        Server localServer = new Server()
                .url("http://localhost:" + serverPort)
                .description("Local Development");

        Server prodServer = new Server()
                .url("https://api.uplc.link")
                .description("Production");

        Contact contact = new Contact()
                .name("UPLC Link Team")
                .email("nemo83@github.com")
                .url("https://github.com/easy1staking-com/plutus-scan");

        License license = new License()
                .name("Apache 2.0")
                .url("https://www.apache.org/licenses/LICENSE-2.0");

        Info info = new Info()
                .title("UPLC Link API")
                .version("1.0.0")
                .description("""
                    # UPLC Link - Cardano Smart Contract Verification API

                    UPLC Link is an open-source registry and verification system for Cardano smart contracts.

                    ## Features
                    - **Verify** Aiken smart contracts against source code
                    - **Register** verified contracts with on-chain metadata
                    - **Search** and explore the public registry

                    ## Authentication
                    No authentication required for read operations. Contract registration requires on-chain
                    transaction with metadata label 1984.

                    ## Rate Limiting
                    Currently no rate limiting enforced. Please be respectful of API usage.

                    ## Support
                    - GitHub: https://github.com/easy1staking-com/plutus-scan
                    - Website: https://uplc.link
                    """)
                .contact(contact)
                .license(license);

        return new OpenAPI()
                .info(info)
                .servers(List.of(localServer, prodServer));
    }
}
