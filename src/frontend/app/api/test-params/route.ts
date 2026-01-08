import { NextRequest, NextResponse } from "next/server";

interface TestRequest {
  compiledCode: string; // CBOR hex from plutus.json
  plutusVersion: "V1" | "V2" | "V3";
  parameters?: string[]; // Optional parameters to apply
}

export async function POST(request: NextRequest) {
  try {
    const body: TestRequest = await request.json();
    const { compiledCode, plutusVersion, parameters } = body;

    // Dynamically import MeshSDK
    const { applyParamsToScript, applyCborEncoding } = await import("@meshsdk/core-csl");
    const { resolveScriptHash } = await import("@meshsdk/core");

    const results: any = {
      original: {},
      withApplyCborEncoding: {},
      withParams: {},
      withParamsCBOR: {},
    };

    // Test 1: Direct hash from compiled code
    console.log("\n=== Test 1: Direct from compiledCode ===");
    try {
      const hash1 = resolveScriptHash(compiledCode, plutusVersion);
      console.log(`Hash (direct): ${hash1}`);
      results.original = {
        method: "resolveScriptHash(compiledCode, version)",
        hash: hash1,
      };
    } catch (error) {
      console.error("Test 1 failed:", error);
      results.original = {
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Test 2: Apply CBOR encoding first, then hash
    console.log("\n=== Test 2: With applyCborEncoding ===");
    try {
      const encoded = applyCborEncoding(compiledCode);
      console.log(`Encoded CBOR: ${encoded.substring(0, 100)}...`);
      const hash2 = resolveScriptHash(encoded, plutusVersion);
      console.log(`Hash (after applyCborEncoding): ${hash2}`);
      results.withApplyCborEncoding = {
        method: "applyCborEncoding -> resolveScriptHash",
        encodedCbor: encoded.substring(0, 100) + "...",
        hash: hash2,
      };
    } catch (error) {
      console.error("Test 2 failed:", error);
      results.withApplyCborEncoding = {
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Test 3: Apply parameters (if provided)
    if (parameters && parameters.length > 0) {
      console.log("\n=== Test 3: With parameters ===");

      // Test 3a: Apply params directly
      try {
        const scriptWithParams = applyParamsToScript(compiledCode, parameters);
        console.log(`Script with params: ${scriptWithParams.substring(0, 100)}...`);
        const hash3a = resolveScriptHash(scriptWithParams, plutusVersion);
        console.log(`Hash (params direct): ${hash3a}`);
        results.withParams.direct = {
          method: "applyParamsToScript(compiledCode) -> resolveScriptHash",
          parameterizedCbor: scriptWithParams.substring(0, 100) + "...",
          hash: hash3a,
        };
      } catch (error) {
        console.error("Test 3a failed:", error);
        results.withParams.direct = {
          error: error instanceof Error ? error.message : String(error),
        };
      }

      // Test 3b: Apply CBOR encoding first, then params
      try {
        const encoded = applyCborEncoding(compiledCode);
        const scriptWithParams = applyParamsToScript(encoded, parameters);
        console.log(`Script with params (from encoded): ${scriptWithParams.substring(0, 100)}...`);
        const hash3b = resolveScriptHash(scriptWithParams, plutusVersion);
        console.log(`Hash (encoded then params): ${hash3b}`);
        results.withParams.afterEncoding = {
          method: "applyCborEncoding -> applyParamsToScript -> resolveScriptHash",
          parameterizedCbor: scriptWithParams.substring(0, 100) + "...",
          hash: hash3b,
        };
      } catch (error) {
        console.error("Test 3b failed:", error);
        results.withParams.afterEncoding = {
          error: error instanceof Error ? error.message : String(error),
        };
      }

      // Test 4: Apply params with CBOR type (NEW - recommended approach)
      console.log("\n=== Test 4: With CBOR data type ===");
      try {
        const scriptWithParams = applyParamsToScript(compiledCode, parameters, "CBOR");
        console.log(`Script with params (CBOR type): ${scriptWithParams.substring(0, 100)}...`);
        const hash4 = resolveScriptHash(scriptWithParams, plutusVersion);
        console.log(`Hash (CBOR type): ${hash4}`);
        results.withParamsCBOR = {
          method: "applyParamsToScript(compiledCode, params, 'CBOR') -> resolveScriptHash",
          parameterizedCbor: scriptWithParams.substring(0, 100) + "...",
          hash: hash4,
        };
      } catch (error) {
        console.error("Test 4 failed:", error);
        results.withParamsCBOR = {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return NextResponse.json({
      success: true,
      results,
      input: {
        compiledCodePreview: compiledCode.substring(0, 100) + "...",
        plutusVersion,
        parameters,
      },
    });
  } catch (error) {
    console.error("Test error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
