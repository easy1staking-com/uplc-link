import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { toAikenReleaseTag } from "@/lib/aiken-version";

// No shell: arguments are passed as arrays, never interpolated into a command line
const execFileAsync = promisify(execFile);

const AIKEN_ENV = {
  ...process.env,
  PATH: `${process.env.HOME}/.aiken/bin:${process.env.PATH}`,
};

const COMMIT_HASH_PATTERN = /^[0-9a-fA-F]{40}(?:[0-9a-fA-F]{24})?$/; // SHA-1 or SHA-256
const MAX_PLUTUS_JSON_BYTES = 10 * 1024 * 1024;

// This endpoint clones and builds arbitrary repos; bound each subprocess so a
// hanging git server or a runaway build can't tie up the request indefinitely.
const EXEC_TIMEOUT_MS = 300_000;
const MAX_EXEC_BUFFER = 10 * 1024 * 1024;
const EXEC_LIMITS = { timeout: EXEC_TIMEOUT_MS, maxBuffer: MAX_EXEC_BUFFER } as const;

function isValidRepoUrl(repoUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(repoUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (!url.hostname) return false;
  // Conservative charset; also blocks git treating the value as an option
  return /^[A-Za-z0-9.\-_:/@~%+]+$/.test(repoUrl) && !repoUrl.startsWith("-");
}

function isValidSourcePath(sourcePath: string): boolean {
  if (sourcePath.length > 200) return false;
  if (path.isAbsolute(sourcePath) || sourcePath.includes("\\")) return false;
  if (!/^[A-Za-z0-9._/-]+$/.test(sourcePath)) return false;
  // No traversal segments
  return sourcePath.split("/").every(seg => seg !== ".." && seg !== "");
}

interface VerifyRequest {
  repoUrl: string;
  commitHash: string;
  aikenVersion: string;
  sourcePath?: string;
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
    const { repoUrl, commitHash, aikenVersion, sourcePath } = body;

    // Validate inputs
    if (!repoUrl || !commitHash || !aikenVersion) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (repoUrl, commitHash, aikenVersion)" },
        { status: 400 }
      );
    }

    // Normalize to an installable release tag (strips "+<build>" metadata,
    // rejects anything that isn't a version so it can't reach the shell)
    const releaseTag = toAikenReleaseTag(aikenVersion);
    if (!releaseTag) {
      return NextResponse.json(
        { success: false, error: `Invalid Aiken version: ${aikenVersion}` },
        { status: 400 }
      );
    }

    if (!isValidRepoUrl(repoUrl)) {
      return NextResponse.json(
        { success: false, error: "Invalid repository URL" },
        { status: 400 }
      );
    }

    if (!COMMIT_HASH_PATTERN.test(commitHash)) {
      return NextResponse.json(
        { success: false, error: "Invalid commit hash (must be 40 or 64 hex chars)" },
        { status: 400 }
      );
    }

    if (sourcePath && !isValidSourcePath(sourcePath)) {
      return NextResponse.json(
        { success: false, error: "Invalid source path" },
        { status: 400 }
      );
    }

    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "plutus-scan-"));
    console.log(`Created temp directory: ${tempDir}`);

    // Clone repository ("--" stops git option parsing for the URL)
    console.log(`Cloning ${repoUrl} at commit ${commitHash}...`);
    const repoDirPath = path.join(tempDir, "repo");
    try {
      await execFileAsync("git", ["clone", "--", repoUrl, repoDirPath], EXEC_LIMITS);
      await execFileAsync("git", ["checkout", commitHash], { cwd: repoDirPath, ...EXEC_LIMITS });
    } catch (error) {
      throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Determine working directory (apply sourcePath if provided)
    const repoDir = path.join(tempDir, "repo");
    const workDir = sourcePath ? path.join(repoDir, sourcePath) : repoDir;

    // Validate source path exists and stays inside the repo (symlink-safe)
    if (sourcePath) {
      try {
        const realWorkDir = await fs.realpath(workDir);
        const realRepoDir = await fs.realpath(repoDir);
        if (realWorkDir !== realRepoDir && !realWorkDir.startsWith(realRepoDir + path.sep)) {
          throw new Error("escapes repository");
        }
        console.log(`Using source path: ${sourcePath}`);
      } catch (error) {
        throw new Error(`Invalid source path: ${sourcePath}`);
      }
    }

    // Install specific Aiken version
    console.log(`Installing Aiken ${releaseTag}...`);
    try {
      await execFileAsync("aikup", ["install", releaseTag], { env: AIKEN_ENV, ...EXEC_LIMITS });
    } catch (error) {
      throw new Error(`Failed to install Aiken version ${releaseTag}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Build the contract with installed Aiken version
    console.log(`Building contract with Aiken ${releaseTag} in ${workDir}...`);
    let buildOutput: string;
    try {
      const { stdout, stderr } = await execFileAsync("aiken", ["build"], {
        cwd: workDir,
        env: AIKEN_ENV,
        ...EXEC_LIMITS,
      });
      buildOutput = stdout + stderr;
      console.log(`Build output:\n${buildOutput}`);
    } catch (error: any) {
      buildOutput = String(error.stdout ?? "") + String(error.stderr ?? "");
      throw new Error(`Build failed: ${buildOutput}`);
    }

    // Extract hashes from build artifacts (grouped by module.name)
    const buildResults = await extractBuildHashes(workDir, repoDir);

    // Build results for client-side processing
    // Note: No server-side parameterization or hash comparison anymore
    const results = buildResults.map(buildResult => ({
      validator: buildResult.validator,
      validatorModule: buildResult.validatorModule,
      validatorName: buildResult.validatorName,
      purposes: buildResult.purposes,
      hash: buildResult.hash, // Script hash - used as unique key
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

async function extractBuildHashes(repoPath: string, repoRoot: string): Promise<BuildResult[]> {
  // Read plutus.json file which contains the build output
  const plutusJsonPath = path.join(repoPath, "plutus.json");

  try {
    // Symlink-safe: the file must resolve inside the cloned repo (a hostile
    // repo could ship plutus.json as a symlink to an arbitrary server file)
    const realPlutusJson = await fs.realpath(plutusJsonPath);
    const realRepoRoot = await fs.realpath(repoRoot);
    if (!realPlutusJson.startsWith(realRepoRoot + path.sep)) {
      throw new Error("plutus.json resolves outside the repository");
    }

    const stat = await fs.stat(realPlutusJson);
    if (stat.size > MAX_PLUTUS_JSON_BYTES) {
      throw new Error(`plutus.json too large (${stat.size} bytes)`);
    }

    const plutusJson = await fs.readFile(realPlutusJson, "utf-8");
    const data = JSON.parse(plutusJson);

    // Read plutusVersion from preamble (default to V3 if not found)
    const plutusVersion = (data.preamble?.plutusVersion?.toUpperCase() || "V3") as "V1" | "V2" | "V3";
    console.log(`Detected Plutus version: ${plutusVersion}`);

    // Group validators by hash (same compiled code = same validator used in different contexts)
    const groupedValidators = new Map<string, {
      validatorModule: string;
      validatorName: string;
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

        // Parse title: "module.name.purpose" (v1.1.X) or "name.purpose" (v1.0.X alpha)
        const parts = title.split(".");
        let validatorModule: string;
        let validatorName: string;
        let purpose: string;

        if (parts.length >= 3) {
          // v1.1.X format: module.name.purpose
          validatorModule = parts[0];
          validatorName = parts[1];
          purpose = parts[2];
        } else if (parts.length === 2) {
          // v1.0.X alpha format: name.purpose
          validatorModule = parts[0]; // Use name as module for v1.0.X
          validatorName = parts[0];
          purpose = parts[1];
        } else {
          // Fallback for unexpected format
          validatorModule = parts[0] || "unknown";
          validatorName = parts[0] || "unknown";
          purpose = "unknown";
        }

        // Group by hash - same hash means same compiled script
        if (!groupedValidators.has(hash)) {
          groupedValidators.set(hash, {
            validatorModule,
            validatorName,
            purposes: [],
            parameters: parameters.length > 0 ? parameters : undefined,
            compiledCode
          });
        }

        // Add purpose to the list (these become "tags")
        groupedValidators.get(hash)!.purposes.push(purpose);
      }
    }

    // Convert grouped validators to results
    const results: BuildResult[] = [];
    for (const [hash, value] of groupedValidators.entries()) {
      // Create a display name for the validator
      // v1.1.X: module.name, v1.0.X: name
      const validator = value.validatorModule === value.validatorName
        ? value.validatorName
        : `${value.validatorModule}.${value.validatorName}`;

      results.push({
        validator,
        validatorModule: value.validatorModule,
        validatorName: value.validatorName,
        purposes: value.purposes,
        hash,
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
