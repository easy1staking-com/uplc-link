package com.easy1staking.plutusscan.model;

import lombok.Getter;

import java.util.Optional;
import java.util.stream.Stream;

@Getter
public enum CompilerType {

    // Constructor ids are normative: they are the CIP-0171 constructor table.
    // Anything outside this set is an unrecognized constructor and is dropped.
    AIKEN(0), PLUTARCH(1), PLUTUSTX(2), SCALUS(3), PLUTS(4), OPSHIN(5);

    private final int compileId;

    CompilerType(int compileId) {
        this.compileId = compileId;
    }

    public static Optional<CompilerType> fromId(int id) {
        return Stream.of(values()).filter(compilerType -> compilerType.compileId == id).findFirst();
    }

}
