/**
 * Generate Merkle tree from allowlist for the badge mint.
 *
 * Usage:
 *   npx ts-node scripts/generate-merkle.ts
 *   # or
 *   npm run merkle
 *
 * Reads: ./allowlist.json
 * Outputs: ./merkle-proofs.json (root + per-address proofs)
 */

import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

const ALLOWLIST_PATH = path.join(__dirname, "..", "allowlist.json");
const OUTPUT_PATH = path.join(__dirname, "..", "merkle-proofs.json");

async function main() {
  console.log(`\n🛡️  MOLT COPS — Allowlist Merkle Generator`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Load allowlist
  if (!fs.existsSync(ALLOWLIST_PATH)) {
    console.error(`\n❌ allowlist.json not found at ${ALLOWLIST_PATH}`);
    console.log(`\nCreate one with an array of addresses:`);
    console.log(`["0x123...", "0x456..."]`);
    process.exit(1);
  }

  const rawAllowlist: string[] = JSON.parse(
    fs.readFileSync(ALLOWLIST_PATH, "utf-8")
  );

  // Validate and normalize addresses
  const allowlist: string[] = [];
  const invalid: string[] = [];

  for (const addr of rawAllowlist) {
    try {
      allowlist.push(ethers.getAddress(addr)); // Checksums the address
    } catch {
      invalid.push(addr);
    }
  }

  if (invalid.length > 0) {
    console.warn(`\n⚠️  Invalid addresses skipped:`);
    invalid.forEach((a) => console.warn(`   ${a}`));
  }

  console.log(`\nAddresses in allowlist: ${allowlist.length}`);

  if (allowlist.length === 0) {
    console.error(`\n❌ No valid addresses in allowlist`);
    process.exit(1);
  }

  if (allowlist.length > 100) {
    console.warn(`\n⚠️  Warning: ${allowlist.length} addresses but only 100 badges exist!`);
  }

  // Generate leaves using double-hash (matches Solidity)
  // Solidity: keccak256(bytes.concat(keccak256(abi.encode(msg.sender))))
  const leaves = allowlist.map((addr) => {
    const packed = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address"],
      [addr]
    );
    return keccak256(keccak256(packed));
  });

  // Build Merkle tree
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = tree.getHexRoot();

  console.log(`\n📊 Merkle Tree Generated`);
  console.log(`   Root: ${root}`);
  console.log(`   Leaves: ${leaves.length}`);
  console.log(`   Depth: ${tree.getDepth()}`);

  // Generate proofs for each address
  const proofs: Record<string, string[]> = {};
  allowlist.forEach((addr, i) => {
    proofs[addr] = tree.getHexProof(leaves[i]);
  });

  // Build output
  const output = {
    root,
    generatedAt: new Date().toISOString(),
    addressCount: allowlist.length,
    proofs,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n💾 Saved to ${OUTPUT_PATH}`);

  // Example verification
  console.log(`\n🔍 Verification Example:`);
  const sampleAddr = allowlist[0];
  const sampleProof = proofs[sampleAddr];
  const sampleLeaf = leaves[0];
  const verified = tree.verify(sampleProof, sampleLeaf, root);
  console.log(`   Address: ${sampleAddr}`);
  console.log(`   Proof valid: ${verified ? "✅" : "❌"}`);

  // Usage instructions
  console.log(`\n━━ NEXT STEPS ━━`);
  console.log(`\n1. Deploy with this merkle root:`);
  console.log(`   npm run deploy:testnet  # or deploy:mainnet`);
  console.log(`\n2. If updating an existing contract:`);
  console.log(`   contract.setMerkleRoot("${root}")`);
  console.log(`\n3. Frontend: serve merkle-proofs.json`);
  console.log(`   User fetches their proof, passes to mint(proof[])\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
