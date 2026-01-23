FROM eclipse-temurin:21-jdk-jammy

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    git \
    build-essential \
    libffi-dev \
    libgmp-dev \
    libtinfo-dev \
    libncurses-dev \
    libnuma-dev \
    zlib1g-dev \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install aikup (Aiken version manager)
RUN curl --proto '=https' --tlsv1.2 -LsSf https://install.aiken-lang.org | sh

# Install GHCup (Haskell toolchain manager)
RUN curl --proto '=https' --tlsv1.2 -sSf https://get-ghcup.haskell.org | \
    BOOTSTRAP_HASKELL_NONINTERACTIVE=1 \
    BOOTSTRAP_HASKELL_GHC_VERSION=9.6.6 \
    BOOTSTRAP_HASKELL_CABAL_VERSION=3.10.3.0 \
    BOOTSTRAP_HASKELL_INSTALL_NO_STACK=1 \
    sh

# Ensure aikup, ghcup, ghc, and cabal are in PATH
ENV PATH="/root/.aiken/bin:/root/.ghcup/bin:/root/.cabal/bin:${PATH}"

# Update cabal package list
RUN /root/.ghcup/bin/cabal update

# Pre-install common Plutus dependencies to speed up builds (optional)
# This can save time but increases image size
# RUN /root/.ghcup/bin/cabal install --lib \
#     plutus-core \
#     plutus-ledger-api \
#     plutus-tx \
#     cardano-api

# Create temp directory for builds
RUN mkdir -p /tmp/plutus-scan-builds

# Add application jar
ADD ./build/libs/*.jar /app/app.jar

WORKDIR /app

ENTRYPOINT ["java", "-jar", "app.jar"]
