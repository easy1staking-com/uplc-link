import { NextRequest, NextResponse } from "next/server";
import { applyParamsAndHash, resolveScriptHash } from "@/lib/cardano/script-hash";

interface TestRequest {
  compiledCode: string; // CBOR hex from plutus.json
  plutusVersion: "V1" | "V2" | "V3";
  parameters?: string[]; // Optional CBOR-encoded parameters to apply
}

/**
 * Debug endpoint: compute script hashes with and without parameters applied.
 */
export async function POST(request: NextRequest) {
  try {
    const body: TestRequest = await request.json();
    const { compiledCode, plutusVersion, parameters } = body;

    const results: Record<string, unknown> = {};

    try {
      results.original = {
        method: "resolveScriptHash(compiledCode, version)",
        hash: resolveScriptHash(compiledCode, plutusVersion),
      };
    } catch (error) {
      results.original = {
        error: error instanceof Error ? error.message : String(error),
      };
    }

    if (parameters && parameters.length > 0) {
      try {
        const { scriptCbor, hash } = applyParamsAndHash(compiledCode, parameters, plutusVersion);
        results.withParams = {
          method: "applyParamsAndHash(compiledCode, params, version)",
          parameterizedCbor: scriptCbor.substring(0, 100) + "...",
          hash,
        };
      } catch (error) {
        results.withParams = {
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
