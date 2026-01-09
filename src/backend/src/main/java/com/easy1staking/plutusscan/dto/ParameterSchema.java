package com.easy1staking.plutusscan.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO representing a parameter schema from plutus.json
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ParameterSchema {
    private String title;
    private Object schema;
}
