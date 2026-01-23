FROM eclipse-temurin:21-jdk-jammy

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    git \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install aikup (Aiken version manager)
RUN curl --proto '=https' --tlsv1.2 -LsSf https://install.aiken-lang.org | sh

# Ensure aikup is in PATH
ENV PATH="/root/.aiken/bin:${PATH}"

# Create temp directory for builds
RUN mkdir -p /tmp/plutus-scan-builds

# Add application jar
ADD ./build/libs/*.jar /app/app.jar

WORKDIR /app

ENTRYPOINT ["java", "-jar", "app.jar"]
