package com.easy1staking.plutusscan.util;

import co.nstant.in.cbor.CborException;
import co.nstant.in.cbor.model.ByteString;
import co.nstant.in.cbor.model.DataItem;
import com.bloxbean.cardano.client.common.cbor.CborSerializationUtil;
import com.bloxbean.cardano.client.exception.CborSerializationException;
import com.bloxbean.cardano.client.plutus.blueprint.PlutusBlueprintUtil;
import com.bloxbean.cardano.client.plutus.blueprint.model.PlutusVersion;
import com.bloxbean.cardano.client.util.HexUtil;
import scalus.uplc.DeBruijnedProgram;
import scalus.uplc.builtin.Data;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Applies Data parameters to a compiled UPLC program, byte-for-byte as
 * {@code aiken blueprint apply} does.
 *
 * Why the splice: {@code aiken blueprint apply} embeds each parameter's CBOR exactly as
 * given, preserving definite-length and other non-canonical Data encodings, whereas
 * Scalus decodes the parameter and re-encodes it canonically, which changes the script
 * hash. So Scalus applies the parameters (it decodes PV11 builtins and Value constants)
 * and its canonical encoding is used only to locate the parameter tail of the flat
 * program, which is then replaced by the same tail built from the raw parameter bytes.
 *
 * Why the tail is byte-aligned and identical in shape for raw and canonical payloads:
 * n parameters flat-encode as {@code 0011}^n (apply tags), then the original term, then
 * the n constants. Each constant is {@code 0100} (const tag), then {@code 1 1000 0}
 * (type list [data]), then a filler, then the CBOR payload as a flat bytestring
 * (length-prefixed chunks of at most 255 bytes and a {@code 0x00} terminator). After a
 * bytestring's terminator the stream is byte-aligned, so every later constant's header
 * plus filler is exactly {@code 0x4C 0x01}, and the program's closing filler is the full
 * byte {@code 0x01}. Only the first constant's header sits at an arbitrary bit offset,
 * inside the prefix that is reused unchanged.
 *
 * Parameters come from attacker-controlled 1984 metadata: every refusal is a
 * RuntimeException, never an Error. A parameter nested past the CBOR decoder's own limit
 * fails with a decoder exception, or with a StackOverflowError when the stack runs out
 * first (JIT-dependent); both are refused as IllegalArgumentException.
 *
 * Why the declared-length pre-scan: borer pre-sizes arrays and strings from the length a
 * CBOR header declares, so a few bytes declaring 2^31 items throw an OutOfMemoryError, an
 * Error no caller handles. Each parameter's headers are therefore walked first, and any
 * length larger than the bytes actually left is refused before the decoder runs.
 */
public final class ParameterApplier {

    private static final int FLAT_CHUNK_MAX = 255;
    private static final int MAX_INDEFINITE_DEPTH = 10_000;

    private ParameterApplier() {
    }

    /**
     * @param compiledCode  blueprint compiledCode: hex of one CBOR bytestring wrapping the flat program
     * @param paramsCborHex CBOR hex of each Data parameter, in application order
     * @return the applied program in the same format as {@code compiledCode}
     */
    public static String applyParams(String compiledCode, List<String> paramsCborHex) {
        if (paramsCborHex == null || paramsCborHex.isEmpty()) {
            throw new IllegalArgumentException("No parameters to apply");
        }
        try {
            byte[] scriptBytes = HexUtil.decodeHexString(compiledCode);
            DeBruijnedProgram program = DeBruijnedProgram.fromCbor(scriptBytes);
            DataItem wrapped = CborSerializationUtil.deserialize(scriptBytes);
            if (!(wrapped instanceof ByteString byteString)) {
                throw new IllegalArgumentException("Compiled code is not a CBOR bytestring");
            }
            byte[] originalFlat = byteString.getBytes();
            requireByteIdenticalRoundTrip(originalFlat, program);

            List<byte[]> rawParams = new ArrayList<>();
            List<byte[]> canonicalParams = new ArrayList<>();
            for (int i = 0; i < paramsCborHex.size(); i++) {
                byte[] raw;
                Data data;
                try {
                    raw = HexUtil.decodeHexString(paramsCborHex.get(i));
                    requireBoundedCbor(raw);
                    data = Data.fromCbor(raw);
                } catch (IllegalArgumentException e) {
                    throw e;
                } catch (RuntimeException e) {
                    throw new IllegalArgumentException("Invalid parameter CBOR at index " + i, e);
                }
                rawParams.add(raw);
                canonicalParams.add(Data.toCbor(data));
                program = program.applyArg(data);
            }

            byte[] flat = program.flatEncoded();
            byte[] canonicalTail = flatDataTail(canonicalParams);
            int prefixLength = flat.length - canonicalTail.length;
            if (prefixLength < 0
                    || !Arrays.equals(flat, prefixLength, flat.length, canonicalTail, 0, canonicalTail.length)) {
                throw new IllegalStateException("Applied program does not end with the expected parameter tail");
            }

            ByteArrayOutputStream result = new ByteArrayOutputStream();
            result.write(flat, 0, prefixLength);
            result.writeBytes(flatDataTail(rawParams));
            return HexUtil.encodeHexString(CborSerializationUtil.serialize(new ByteString(result.toByteArray())));
        } catch (CborException e) {
            throw new IllegalArgumentException("Failed to encode applied program: " + e.getMessage(), e);
        } catch (StackOverflowError e) {
            throw new IllegalArgumentException("Parameter or program nested too deeply", e);
        }
    }

    public static String applyParamsAndHash(String compiledCode, List<String> paramsCborHex, PlutusVersion plutusVersion) {
        try {
            return PlutusBlueprintUtil.getPlutusScriptFromCompiledCode(applyParams(compiledCode, paramsCborHex), plutusVersion)
                    .getPolicyId();
        } catch (CborSerializationException e) {
            throw new IllegalArgumentException("Failed to hash applied program: " + e.getMessage(), e);
        }
    }

    /**
     * Flat encoding of the byte-aligned parameter tail: each payload as a flat bytestring,
     * later payloads preceded by their constant header plus filler, then the closing filler.
     */
    private static byte[] flatDataTail(List<byte[]> payloads) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (int i = 0; i < payloads.size(); i++) {
            if (i > 0) {
                out.write(0x4C);
                out.write(0x01);
            }
            byte[] payload = payloads.get(i);
            int offset = 0;
            while (offset < payload.length) {
                int chunk = Math.min(FLAT_CHUNK_MAX, payload.length - offset);
                out.write(chunk);
                out.write(payload, offset, chunk);
                offset += chunk;
            }
            out.write(0x00);
        }
        out.write(0x01);
        return out.toByteArray();
    }

    /**
     * Walks the headers of the first CBOR item in {@code raw} iteratively, refusing any
     * declared length the remaining bytes cannot hold. Definite children are counted in
     * {@code pending}; each open indefinite container saves its parent's count on a stack.
     * Validates headers only: the decoder still judges the item as Data.
     */
    private static void requireBoundedCbor(byte[] raw) {
        long pending = 1;
        long[] enclosing = new long[16];
        int depth = 0;
        int pos = 0;
        while (pending > 0 || depth > 0) {
            int offset = pos;
            if (pos >= raw.length) {
                throw cborRefusal(offset, "truncated");
            }
            int initial = raw[pos++] & 0xff;
            if (initial == 0xff) {
                if (depth == 0 || pending > 0) {
                    throw cborRefusal(offset, "unexpected break");
                }
                pending = enclosing[--depth];
                continue;
            }
            if (pending > 0) {
                pending--;
            }
            int major = initial >>> 5;
            int additionalInfo = initial & 0x1f;
            if (additionalInfo >= 28 && additionalInfo <= 30) {
                throw cborRefusal(offset, "reserved additional info " + additionalInfo);
            }
            if (additionalInfo == 31) {
                if (major < 2 || major > 5) {
                    throw cborRefusal(offset, "indefinite length on major type " + major);
                }
                if (depth == MAX_INDEFINITE_DEPTH) {
                    throw cborRefusal(offset, "indefinite nesting deeper than " + MAX_INDEFINITE_DEPTH);
                }
                if (depth == enclosing.length) {
                    enclosing = Arrays.copyOf(enclosing, depth * 2);
                }
                enclosing[depth++] = pending;
                pending = 0;
                continue;
            }
            long argument = additionalInfo;
            if (additionalInfo >= 24) {
                int width = 1 << (additionalInfo - 24);
                if (width > raw.length - pos) {
                    throw cborRefusal(offset, "truncated");
                }
                argument = 0;
                for (int b = 0; b < width; b++) {
                    argument = (argument << 8) | (raw[pos++] & 0xff);
                }
            }
            if (major < 2 || major > 5) {
                if (major == 6) {
                    pending++;
                }
                continue;
            }
            if (argument < 0) {
                throw cborRefusal(offset, "declared length is 2^63 or more");
            }
            int remaining = raw.length - pos;
            if (major <= 3) {
                if (Long.compareUnsigned(argument, remaining) > 0) {
                    throw cborRefusal(offset, "declared length " + Long.toUnsignedString(argument)
                            + " exceeds the " + remaining + " remaining bytes");
                }
                pos += (int) argument;
            } else {
                // every child takes at least one byte; a map has two per entry. The first
                // comparison bounds argument before doubling it can overflow.
                long children = major == 5 ? 2 * argument : argument;
                if (Long.compareUnsigned(argument, remaining) > 0 || children > remaining) {
                    throw cborRefusal(offset, "declared length " + Long.toUnsignedString(argument)
                            + (major == 5 ? " (map entries)" : "") + " exceeds the " + remaining + " remaining bytes");
                }
                pending += children;
            }
        }
    }

    private static IllegalArgumentException cborRefusal(int offset, String reason) {
        return new IllegalArgumentException("Parameter CBOR at offset " + offset + ": " + reason);
    }

    /**
     * The reused prefix comes from Scalus's re-encoding, so it must equal the original bytes.
     */
    private static void requireByteIdenticalRoundTrip(byte[] originalFlat, DeBruijnedProgram program) {
        if (!Arrays.equals(originalFlat, program.flatEncoded())) {
            throw new IllegalArgumentException("Compiled code does not round-trip byte-identically through Scalus");
        }
    }
}
