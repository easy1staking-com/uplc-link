FROM eclipse-temurin:21-jdk-jammy

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    git \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Aiken v1.0.28/29-alpha binaries link OpenSSL 1.1, which jammy no longer
# ships — install libssl1.1 (Debian's build, needs only glibc >= 2.25)
# side-by-side with libssl3 so replays pinned to those compiler versions
# still build. Latest deb resolved from the pool listing (falls back to the
# archive mirror when bullseye security retires).
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    for base in \
      http://security.debian.org/debian-security/pool/updates/main/o/openssl \
      http://archive.debian.org/debian-security/pool/updates/main/o/openssl; do \
      deb="$(curl -fsSL "$base/" | grep -oE "libssl1\.1_1\.1\.1[a-z0-9.+~-]*_${arch}\.deb" | sort -uV | tail -n1)" || continue; \
      [ -n "$deb" ] || continue; \
      if curl -fsSL -o /tmp/libssl1.1.deb "$base/$deb"; then break; fi; \
    done; \
    dpkg -i /tmp/libssl1.1.deb; \
    rm -f /tmp/libssl1.1.deb

# No Aiken is preinstalled: the backend downloads each requested release on
# demand into /root/.aiken/versions/ and runs it by absolute path

# Create temp directory for builds
RUN mkdir -p /tmp/plutus-scan-builds

# Add application jar
ADD ./build/libs/*.jar /app/app.jar

WORKDIR /app

ENTRYPOINT ["java", "-jar", "app.jar"]
