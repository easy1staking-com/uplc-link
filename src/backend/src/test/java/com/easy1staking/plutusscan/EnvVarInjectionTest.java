package com.easy1staking.plutusscan;

public class EnvVarInjectionTest {

    protected static final String WALLET_MNEMONIC = System.getenv("WALLET_MNEMONIC");

    protected static final String BLOCKFROST_KEY = System.getenv("BLOCKFROST_KEY");

}
