FROM rust:1.75-bookworm

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    pkg-config \
    build-essential \
    libudev-dev \
    libhidapi-dev \
    libssl-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Solana CLI (Native ARM64)
RUN mkdir -p /root/.local/share/solana/install/active_release/bin && \
    curl -sSfL --retry 10 --retry-delay 3 --retry-all-errors https://release.solana.com/v1.18.15/solana-release-aarch64-unknown-linux-gnu.tar.bz2 | tar jxf - -C /root/.local/share/solana/install && \
    mv /root/.local/share/solana/install/solana-release/* /root/.local/share/solana/install/active_release/ && \
    rm -rf /root/.local/share/solana/install/solana-release

# Ensure Solana and Anchor are in PATH
ENV PATH="/root/.local/share/solana/install/active_release/bin:/usr/local/cargo/bin:${PATH}"

# Install Anchor CLI (Native ARM64)
RUN cargo install --git https://github.com/coral-xyz/anchor --tag v0.29.0 anchor-cli --locked

WORKDIR /app

# The command will be provided by docker-compose
