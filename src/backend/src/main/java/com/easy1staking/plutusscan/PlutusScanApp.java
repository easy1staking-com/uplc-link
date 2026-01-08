package com.easy1staking.plutusscan;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.easy1staking.plutusscan")
public class PlutusScanApp {

    public static void main(String[] args) {
        SpringApplication.run(PlutusScanApp.class, args);
    }

}
