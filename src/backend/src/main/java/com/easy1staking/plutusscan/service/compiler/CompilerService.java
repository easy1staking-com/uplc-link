package com.easy1staking.plutusscan.service.compiler;

import com.easy1staking.plutusscan.exception.CompilationException;
import com.easy1staking.plutusscan.model.CompilerType;

/**
 * Interface for compiler services that compile smart contracts from VCS repositories
 * Supports GitHub, GitLab, Codeberg, self-hosted Git, and future decentralized storage
 */
public interface CompilerService {

    /**
     * Compile a smart contract project and return the plutus.json content
     *
     * @param sourceUrl VCS source URL with protocol (e.g., https://github.com/org/repo, https://gitlab.com/group/project)
     * @param commitHash Git commit hash (SHA-1 or SHA-256)
     * @param compilerVersion Compiler version (e.g., "v1.1.3" for Aiken)
     * @param sourcePath Path within repository (null or empty for root)
     * @return plutus.json content as a JSON string
     * @throws CompilationException If compilation fails
     */
    String compile(String sourceUrl, String commitHash,
                   String compilerVersion, String sourcePath)
            throws CompilationException;

    /**
     * Get the compiler type this service handles
     */
    CompilerType getCompilerType();
}
