#!/bin/bash

# Example test script for UPLC Link
# This shows how to verify a contract using curl

curl -X POST http://localhost:3000/api/verify \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/aiken-lang/aiken",
    "commitHash": "main",
    "aikenVersion": "v1.1.21",
    "expectedHashes": [
      "example_hash_1",
      "example_hash_2"
    ]
  }' | jq .

# Note: Replace with actual repo, commit, and expected hashes
# You can also test with a real Aiken project repository
