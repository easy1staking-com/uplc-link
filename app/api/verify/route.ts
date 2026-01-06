import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

interface ParameterValue {
  name: string;
  value: string;
  valueType?: "direct" | "validator_reference"; // direct = user input, validator_reference = hash from another validator
  referenceTo?: string; // validator name if valueType is validator_reference
}

interface ValidatorParameters {
  validatorName: string; // e.g., "settings.settings"
  parameters: ParameterValue[];
}

interface VerifyRequest {
  repoUrl: string;
  commitHash: string;
  aikenVersion: string;
  expectedHashes: string[] | Record<string, string>; // Support both array and named object
  validatorParameters?: ValidatorParameters[]; // Optional parameter values
}

interface ParameterSchema {
  title?: string;
  schema: any;
}

interface BuildResult {
  validator: string;
  validatorModule: string;
  validatorName: string;
  purposes: string[];
  hash: string;
  parameters?: ParameterSchema[];
  compiledCode: string; // Original unparameterized code
  plutusVersion: "V1" | "V2" | "V3"; // Plutus version from preamble
}

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;

  try {
    const body: VerifyRequest = await request.json();
    const { repoUrl, commitHash, aikenVersion, expectedHashes, validatorParameters } = body;

    // Validate inputs
    if (!repoUrl || !commitHash || !aikenVersion || !expectedHashes) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "plutus-scan-"));
    console.log(`Created temp directory: ${tempDir}`);

    // Clone repository
    console.log(`Cloning ${repoUrl} at commit ${commitHash}...`);
    try {
      await execAsync(`git clone ${repoUrl} ${tempDir}/repo`);
      await execAsync(`cd ${tempDir}/repo && git checkout ${commitHash}`);
    } catch (error) {
      throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Install specific Aiken version
    console.log(`Installing Aiken ${aikenVersion}...`);
    try {
      await execAsync(`aikup install ${aikenVersion}`, {
        env: { ...process.env, PATH: `${process.env.HOME}/.aiken/bin:${process.env.PATH}` },
      });
    } catch (error) {
      throw new Error(`Failed to install Aiken version ${aikenVersion}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Build the contract with installed Aiken version
    console.log(`Building contract with Aiken ${aikenVersion}...`);
    let buildOutput: string;
    try {
      const { stdout, stderr } = await execAsync(`cd ${tempDir}/repo && aiken build`, {
        env: { ...process.env, PATH: `${process.env.HOME}/.aiken/bin:${process.env.PATH}` },
      });
      buildOutput = stdout + stderr;
      console.log(`Build output:\n${buildOutput}`);
    } catch (error: any) {
      buildOutput = error.stdout + error.stderr;
      throw new Error(`Build failed: ${buildOutput}`);
    }

    // Extract hashes from build artifacts (grouped by module.name)
    const buildResults = await extractBuildHashes(path.join(tempDir, "repo"));

    // Normalize expected hashes
    const normalizedExpected = normalizeExpectedHashes(expectedHashes, buildResults);

    // Build a map to store calculated hashes (for validator references)
    // Pre-populate with all unparameterized hashes so validators can reference each other
    const calculatedHashes: Record<string, string> = {};
    for (const buildResult of buildResults) {
      calculatedHashes[buildResult.validator] = buildResult.hash;
    }

    console.log("Pre-populated hashes for references:", calculatedHashes);

    // Apply parameters if provided and calculate hashes
    const results = [];
    for (const buildResult of buildResults) {
      let actualHash = buildResult.hash; // Default to unparameterized hash
      let parameterized = false;

      // Check if this validator has parameter values provided
      const validatorParams = validatorParameters?.find(
        vp => vp.validatorName === buildResult.validator
      );

      console.log(`\nProcessing validator: ${buildResult.validator}`);
      console.log(`Has params from request:`, validatorParams);

      if (validatorParams && buildResult.parameters && buildResult.parameters.length > 0) {
        try {
          // Resolve parameter values (handle validator references)
          const resolvedParams = validatorParams.parameters.map((param, idx) => {
            console.log(`  Param ${idx} (${param.name}):`, {
              value: param.value,
              valueType: param.valueType,
              referenceTo: param.referenceTo
            });

            if (param.valueType === "validator_reference" && param.referenceTo) {
              // Use the calculated hash of the referenced validator
              const hash = calculatedHashes[param.referenceTo] || param.value;
              // CBOR-encode the hash (28 bytes = 56 hex chars → 0x581C prefix + hash)
              const cborEncodedHash = `581C${hash}`;
              console.log(`    → Resolved to hash: ${hash} → CBOR-encoded: ${cborEncodedHash}`);
              return cborEncodedHash;
            }
            console.log(`    → Using direct value: ${param.value}`);
            return param.value;
          });

          // Apply parameters and calculate new hash
          const { hash } = await applyParametersToValidator(
            buildResult.compiledCode,
            resolvedParams,
            buildResult.plutusVersion
          );
          actualHash = hash;
          parameterized = true;

          // Store calculated hash for potential references
          calculatedHashes[buildResult.validator] = hash;
        } catch (error) {
          console.error(`Failed to apply parameters to ${buildResult.validator}:`, error);
          actualHash = "ERROR";
        }
      } else {
        // No parameters applied, store unparameterized hash
        calculatedHashes[buildResult.validator] = buildResult.hash;
      }

      const expectedHash = normalizedExpected[buildResult.validator];
      const hasExpected = expectedHash !== null && expectedHash !== undefined && expectedHash !== "";
      const requiresParams = buildResult.parameters && buildResult.parameters.length > 0;

      results.push({
        validator: buildResult.validator,
        validatorModule: buildResult.validatorModule,
        validatorName: buildResult.validatorName,
        purposes: buildResult.purposes,
        parameters: buildResult.parameters,
        expected: hasExpected ? expectedHash : "N/A",
        actual: actualHash || "N/A",
        matches: hasExpected ? actualHash === expectedHash : null,
        missing: !hasExpected,
        requiresParams,
        parameterized,
        compiledCode: buildResult.compiledCode, // Include for client-side parameterization
        plutusVersion: buildResult.plutusVersion, // Include for client-side parameterization
      });
    }

    const allMatch = results.every((r) => r.matches === true);
    const warnings: string[] = [];

    // Warn about validators that require parameters but don't have them
    results.forEach(r => {
      if (r.requiresParams && !r.parameterized) {
        warnings.push(`${r.validator} requires parameters but none were provided`);
      }
    });

    return NextResponse.json({
      success: allMatch,
      results,
      buildLog: buildOutput,
      warnings,
    });
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json(
      {
        success: false,
        results: [],
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  } finally {
    // Cleanup
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        console.log(`Cleaned up temp directory: ${tempDir}`);
      } catch (error) {
        console.error(`Failed to cleanup temp directory: ${error}`);
      }
    }
  }
}

async function extractBuildHashes(repoPath: string): Promise<BuildResult[]> {
  // Read plutus.json file which contains the build output
  const plutusJsonPath = path.join(repoPath, "plutus.json");

  try {
    const plutusJson = await fs.readFile(plutusJsonPath, "utf-8");
    const data = JSON.parse(plutusJson);

    // Read plutusVersion from preamble (default to V3 if not found)
    const plutusVersion = (data.preamble?.plutusVersion?.toUpperCase() || "V3") as "V1" | "V2" | "V3";
    console.log(`Detected Plutus version: ${plutusVersion}`);

    // Group validators by module.name (title format: "module.name.purpose")
    const groupedValidators = new Map<string, {
      hash: string;
      purposes: string[];
      parameters?: ParameterSchema[];
      compiledCode: string;
    }>();

    if (data.validators && Array.isArray(data.validators)) {
      for (const validator of data.validators) {
        const title = validator.title || validator.name || "unknown";
        const hash = validator.hash || validator.compiledCode || "";
        const compiledCode = validator.compiledCode || "";
        const parameters = validator.parameters || [];

        // Parse title: "module.name.purpose"
        const parts = title.split(".");
        if (parts.length >= 3) {
          const validatorModule = parts[0];
          const validatorName = parts[1];
          const purpose = parts[2];
          const key = `${validatorModule}.${validatorName}`;

          if (!groupedValidators.has(key)) {
            groupedValidators.set(key, {
              hash,
              purposes: [],
              parameters: parameters.length > 0 ? parameters : undefined,
              compiledCode
            });
          }
          groupedValidators.get(key)!.purposes.push(purpose);
        }
      }
    }

    // Convert grouped validators to results
    const results: BuildResult[] = [];
    for (const [key, value] of groupedValidators.entries()) {
      const [validatorModule, validatorName] = key.split(".");
      results.push({
        validator: key,
        validatorModule,
        validatorName,
        purposes: value.purposes,
        hash: value.hash,
        parameters: value.parameters,
        compiledCode: value.compiledCode,
        plutusVersion,
      });
    }

    return results;
  } catch (error) {
    console.error("Failed to read plutus.json:", error);
    return [];
  }
}

/**
 * Normalize expected hashes to a map of validator name -> hash
 */
function normalizeExpectedHashes(
  expectedHashes: string[] | Record<string, string>,
  validators: BuildResult[]
): Record<string, string> {
  if (Array.isArray(expectedHashes)) {
    // Array format - match by index
    const normalized: Record<string, string> = {};
    validators.forEach((v, idx) => {
      if (expectedHashes[idx]) {
        normalized[v.validator] = expectedHashes[idx];
      }
    });
    return normalized;
  } else {
    // Already in object format
    return expectedHashes;
  }
}

/**
 * Apply parameters to a validator's compiled code and calculate the new hash
 */
async function applyParametersToValidator(
  compiledCode: string,
  parameterValues: string[],
  plutusVersion: "V1" | "V2" | "V3"
): Promise<{ scriptCbor: string; hash: string }> {
  try {
    // Dynamically import MeshSDK to avoid webpack issues
    const { applyParamsToScript } = await import("@meshsdk/core-csl");
    const { resolveScriptHash } = await import("@meshsdk/core");

    console.log(`Applying parameters to ${plutusVersion} script...`);
    console.log(`Parameters:`, parameterValues);

    // Apply parameters with CBOR data type (parameters are already CBOR-encoded)
    const scriptCbor = applyParamsToScript(compiledCode, parameterValues, "CBOR");

    // Calculate the new script hash
    const hash = resolveScriptHash(scriptCbor, plutusVersion);

    console.log(`Parameterized hash: ${hash}`);

    return { scriptCbor, hash };
  } catch (error) {
    console.error("Failed to apply parameters:", error);
    throw new Error(`Parameter application failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
