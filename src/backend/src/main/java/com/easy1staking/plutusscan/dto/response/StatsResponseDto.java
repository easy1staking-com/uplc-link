package com.easy1staking.plutusscan.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StatsResponseDto {
    private long verifications;
    private long scripts;
    private long repositories;
}
