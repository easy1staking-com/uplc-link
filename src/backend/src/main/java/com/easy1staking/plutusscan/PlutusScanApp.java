package com.easy1staking.plutusscan;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(scanBasePackages = "com.easy1staking.plutusscan")
@EnableJpaRepositories(basePackages = "com.easy1staking.plutusscan.domain.repository")
@EntityScan(basePackages = "com.easy1staking.plutusscan.domain.entity")
@EnableScheduling
public class PlutusScanApp {

    public static void main(String[] args) {
        SpringApplication.run(PlutusScanApp.class, args);
    }

}
