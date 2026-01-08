import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

interface VerifyRequest {
  repoUrl: string;
  commitHash: string;
  aikenVersion: string;
  // Note: expectedHashes and validatorParameters are no longer used
  // All comparison and parameterization happens client-side
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
    const { repoUrl, commitHash, aikenVersion } = body;

    // Validate inputs
    if (!repoUrl || !commitHash || !aikenVersion) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (repoUrl, commitHash, aikenVersion)" },
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

    // Build results for client-side processing
    // Note: No server-side parameterization or hash comparison anymore
    const results = buildResults.map(buildResult => ({
      validator: buildResult.validator,
      validatorModule: buildResult.validatorModule,
      validatorName: buildResult.validatorName,
      purposes: buildResult.purposes,
      parameters: buildResult.parameters,
      expected: "N/A", // Not used anymore, client handles comparison
      actual: buildResult.hash,
      matches: null, // Not used anymore, client handles comparison
      missing: false, // Not used anymore, client handles comparison
      requiresParams: buildResult.parameters && buildResult.parameters.length > 0,
      parameterized: false, // Client handles parameterization
      compiledCode: buildResult.compiledCode, // Include for client-side parameterization
      plutusVersion: buildResult.plutusVersion, // Include for client-side parameterization
    }));

    return NextResponse.json({
      success: true, // Always true, client determines actual success
      results,
      buildLog: buildOutput,
      warnings: [], // No warnings from server
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

// Note: normalizeExpectedHashes and applyParametersToValidator functions removed
// All hash comparison and parameterization now happens client-side
