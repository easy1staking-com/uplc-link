/**
 * Test metadata encoding to ensure it matches Java backend serialization
 *
 * This test reproduces the simpleSerdeTest from SerdeTest.java
 * to ensure the TypeScript serialization matches the Java CBOR output.
 */

import { encodeVerificationMetadata, chunkMetadata } from '../lib/cardano/metadata-encoder';

/**
 * Test data from Java SerdeTest.simpleSerdeTest():
 *
 * sourceUrl: "http://github.com/easy1staking-com/cardano-recurring-payment"
 * commitHash: "35f1a0d51c8663782ab052f869d5c82b756e8615"
 * sourcePath: ""
 * compilerVersion: "v1.1.3"
 * parameters:
 *   - "e513498211e006e0fa7679e7c51ef09fd0b53904b7bfa5d9fb3dd01b" -> ["d8799f58208c198e942f1f7a60e704aa1651333b45bccd51653259204e4dac38b559844dd800ff"]
 *   - "39b875da204d886d1ea0c4ae193281b819236efa36ab0b711bb3977e" -> ["66d403abc1d6f1206b74c64204766e46601b88747575f6a0a02142a0"]
 *
 * Expected CBOR hex output (before chunking):
 * d8799f583c687474703a2f2f6769746875622e636f6d2f65617379317374616b696e672d636f6d2f63617264616e6f2d726563757272696e672d7061796d656e745435f1a0d51c8663782ab052f869d5c82b756e8615404676312e312e33a2581c39b875da204d886d1ea0c4ae193281b819236efa36ab0b711bb3977e9f581c66d403abc1d6f1206b74c64204766e46601b88747575f6a0a02142a0ff581ce513498211e006e0fa7679e7c51ef09fd0b53904b7bfa5d9fb3dd01b9f5827d8799f58208c198e942f1f7a60e704aa1651333b45bccd51653259204e4dac38b559844dd800ffffff
 */
function testMetadataEncoding() {
  const testData = {
    sourceUrl: "http://github.com/easy1staking-com/cardano-recurring-payment",
    commitHash: "35f1a0d51c8663782ab052f869d5c82b756e8615",
    sourcePath: "",
    compilerVersion: "v1.1.3",
    parameters: {
      "e513498211e006e0fa7679e7c51ef09fd0b53904b7bfa5d9fb3dd01b": [
        "d8799f58208c198e942f1f7a60e704aa1651333b45bccd51653259204e4dac38b559844dd800ff"
      ],
      "39b875da204d886d1ea0c4ae193281b819236efa36ab0b711bb3977e": [
        "66d403abc1d6f1206b74c64204766e46601b88747575f6a0a02142a0"
      ]
    }
  };

  const expectedHex = "d8799f583c687474703a2f2f6769746875622e636f6d2f65617379317374616b696e672d636f6d2f63617264616e6f2d726563757272696e672d7061796d656e745435f1a0d51c8663782ab052f869d5c82b756e8615404676312e312e33a2581c39b875da204d886d1ea0c4ae193281b819236efa36ab0b711bb3977e9f581c66d403abc1d6f1206b74c64204766e46601b88747575f6a0a02142a0ff581ce513498211e006e0fa7679e7c51ef09fd0b53904b7bfa5d9fb3dd01b9f5827d8799f58208c198e942f1f7a60e704aa1651333b45bccd51653259204e4dac38b559844dd800ffffff";

  // Expected chunks (64 bytes = 128 hex chars each, except last)
  // From Java test output split by newlines
  const expectedChunks = [
    "d8799f583c687474703a2f2f6769746875622e636f6d2f65617379317374616b696e672d636f6d2f63617264616e6f2d726563757272696e672d7061796d656e",
    "745435f1a0d51c8663782ab052f869d5c82b756e8615404676312e312e33a2581c39b875da204d886d1ea0c4ae193281b819236efa36ab0b711bb3977e9f581c",
    "66d403abc1d6f1206b74c64204766e46601b88747575f6a0a02142a0ff581ce513498211e006e0fa7679e7c51ef09fd0b53904b7bfa5d9fb3dd01b9f5827d879",
    "9f58208c198e942f1f7a60e704aa1651333b45bccd51653259204e4dac38b559844dd800ffffff"
  ];

  console.log("=".repeat(80));
  console.log("Metadata Encoding Test");
  console.log("=".repeat(80));
  console.log();

  console.log("Test Data:");
  console.log("  Source URL:", testData.sourceUrl);
  console.log("  Commit Hash:", testData.commitHash);
  console.log("  Compiler Version:", testData.compilerVersion);
  console.log("  Parameters:", Object.keys(testData.parameters).length, "validators");
  console.log();

  try {
    const actualHex = encodeVerificationMetadata(testData);

    console.log("Expected Hex:");
    console.log(" ", expectedHex);
    console.log();
    console.log("Actual Hex:");
    console.log(" ", actualHex);
    console.log();

    const serializationMatch = actualHex.toLowerCase() === expectedHex.toLowerCase();

    if (serializationMatch) {
      console.log("✅ SUCCESS: Serialization matches Java backend!");
    } else {
      console.log("❌ FAILURE: Serialization does NOT match Java backend");
      console.log();
      console.log("Length comparison:");
      console.log("  Expected:", expectedHex.length);
      console.log("  Actual:", actualHex.length);
      console.log();

      // Find first difference
      const minLength = Math.min(expectedHex.length, actualHex.length);
      for (let i = 0; i < minLength; i++) {
        if (expectedHex[i] !== actualHex[i]) {
          console.log("First difference at position", i);
          console.log("  Expected:", expectedHex.substring(Math.max(0, i - 10), i + 20));
          console.log("  Actual:  ", actualHex.substring(Math.max(0, i - 10), i + 20));
          break;
        }
      }
    }

    console.log();
    console.log("-".repeat(80));
    console.log("Testing Chunking (64-byte chunks = 128 hex chars)");
    console.log("-".repeat(80));
    console.log();

    // Test chunking
    const actualChunks = chunkMetadata(actualHex, 128); // 128 hex chars = 64 bytes

    console.log("Expected Chunks:", expectedChunks.length);
    expectedChunks.forEach((chunk, i) => {
      console.log(`  [${i}] (${chunk.length} chars):`, chunk.substring(0, 40) + "...");
    });
    console.log();

    console.log("Actual Chunks:", actualChunks.length);
    actualChunks.forEach((chunk, i) => {
      console.log(`  [${i}] (${chunk.length} chars):`, chunk.substring(0, 40) + "...");
    });
    console.log();

    // Compare chunks
    let chunksMatch = true;
    if (actualChunks.length !== expectedChunks.length) {
      console.log("❌ FAILURE: Chunk count mismatch!");
      console.log("  Expected:", expectedChunks.length);
      console.log("  Actual:", actualChunks.length);
      chunksMatch = false;
    } else {
      for (let i = 0; i < expectedChunks.length; i++) {
        if (actualChunks[i].toLowerCase() !== expectedChunks[i].toLowerCase()) {
          console.log(`❌ FAILURE: Chunk ${i} does NOT match`);
          console.log("  Expected:", expectedChunks[i]);
          console.log("  Actual:  ", actualChunks[i]);
          chunksMatch = false;
          break;
        }
      }

      if (chunksMatch) {
        console.log("✅ SUCCESS: All chunks match Java backend!");
      }
    }

    console.log();
    console.log("=".repeat(80));

    return serializationMatch && chunksMatch;
  } catch (error) {
    console.error("❌ ERROR during serialization:", error);
    console.log();
    console.log("=".repeat(80));
    return false;
  }
}

// Run the test
if (require.main === module) {
  const success = testMetadataEncoding();
  process.exit(success ? 0 : 1);
}

export { testMetadataEncoding };
