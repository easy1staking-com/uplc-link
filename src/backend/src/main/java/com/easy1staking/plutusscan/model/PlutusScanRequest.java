package com.easy1staking.plutusscan.model;

import com.bloxbean.cardano.client.plutus.spec.*;
import com.bloxbean.cardano.client.util.HexUtil;
import lombok.Builder;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

@Builder
public record PlutusScanRequest(CompilerType compilerType,
                                String sourceUrl,
                                String commitHash,
                                // Optional<> - Path within repository
                                String sourcePath,
                                // Optional<>
                                String compilerVersion,
                                Map<String, List<String>> parameters) {

    public PlutusData toPlutusData() {

        var scriptHashToParametersMap = new MapPlutusData();

        parameters.forEach((k, v) -> {
            var key = BytesPlutusData.of(HexUtil.decodeHexString(k));
            var valuesList = v.stream().map(HexUtil::decodeHexString).map(BytesPlutusData::of).toList().toArray(new PlutusData[0]);
            var values = ListPlutusData.of(valuesList);
            scriptHashToParametersMap.put(key, values);
        });

        return ConstrPlutusData.of(compilerType.getCompileId(),
                BytesPlutusData.of(sourceUrl),
                BytesPlutusData.of(HexUtil.decodeHexString(commitHash)),
                BytesPlutusData.of(sourcePath != null ? sourcePath : ""),
                BytesPlutusData.of(compilerVersion != null ? compilerVersion : ""),
                scriptHashToParametersMap
        );
    }

    public List<String> toCborChunks() {
        return this.toCborChunks(64);
    }

    public List<String> toCborChunks(int size) {
        var chunks = new ArrayList<String>();
        var hex = toPlutusData().serializeToHex();

        while (hex.length() > size) {
            chunks.add(hex.substring(0, size));
            hex = hex.substring(size);
        }
        chunks.add(hex);
        return chunks;
    }

    public List<byte[]> toCborBytesChunks(int size) {
        var chunks = new ArrayList<byte[]>();
        var i = 0;
        var hex = toPlutusData().serializeToBytes();
        while (hex.length > i * size + size) {
            var bytes = Arrays.copyOfRange(hex, i * size, i * size + size);
            chunks.add(bytes);
            i++;
        }
        var lastChunk = Arrays.copyOfRange(hex, i * size, hex.length);
        chunks.add(lastChunk);
        return chunks;
    }

}
