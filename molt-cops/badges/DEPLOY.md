# Founding Operative Badge — Deployment Kit

## Directory Structure

```
badges/
├── contracts/
│   └── FoundingOperativeBadge.sol
├── scripts/
│   ├── deploy.ts
│   └── generate-merkle.ts
├── test/
│   └── Badge.test.ts
├── allowlist.json            ← addresses approved to mint
├── hardhat.config.ts
├── package.json
└── .env
```

## Quick Start

```bash
# 1. Install
mkdir molt-cops-badges && cd molt-cops-badges
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npm install @openzeppelin/contracts merkletreejs keccak256

npx hardhat init  # Choose TypeScript

# 2. Copy FoundingOperativeBadge.sol into contracts/

# 3. Configure .env
cat > .env << 'EOF'
DEPLOYER_PRIVATE_KEY=0x...your_deployer_key
BASE_RPC_URL=https://mainnet.base.org
BASESCAN_API_KEY=...your_basescan_key
EOF

# 4. Generate Merkle root from allowlist
npx ts-node scripts/generate-merkle.ts

# 5. Deploy
npx hardhat run scripts/deploy.ts --network base

# 6. Verify on Basescan
npx hardhat verify --network base DEPLOYED_ADDRESS "MERKLE_ROOT" "OWNER_ADDRESS"
```

---

## hardhat.config.ts

```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,  // Needed for the on-chain SVG string concatenation
    },
  },
  networks: {
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 8453,
    },
    baseSepolia: {
      url: "https://sepolia.base.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 84532,
    },
  },
  etherscan: {
    apiKey: {
      base: process.env.BASESCAN_API_KEY || "",
      baseSepolia: process.env.BASESCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
};

export default config;
```

---

## scripts/generate-merkle.ts

```typescript
/**
 * Generate Merkle tree from allowlist for the badge mint.
 *
 * Usage:
 *   npx ts-node scripts/generate-merkle.ts
 *
 * Reads: ./allowlist.json
 * Outputs: Merkle root + individual proofs for each address
 */

import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import { ethers } from "ethers";
import * as fs from "fs";

// Load allowlist
const allowlist: string[] = JSON.parse(
  fs.readFileSync("./allowlist.json", "utf-8")
);

console.log(`\n🛡️  Molt Cops Allowlist Merkle Generator`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Addresses: ${allowlist.length}`);

// Generate leaves using double-hash (matches Solidity: keccak256(abi.encode(addr)))
const leaves = allowlist.map((addr) => {
  const packed = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address"],
    [ethers.getAddress(addr)]
  );
  return keccak256(keccak256(packed));
});

// Build tree
const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
const root = tree.getHexRoot();

console.log(`\nMerkle Root: ${root}`);
console.log(`\nUse this root when deploying the contract.`);

// Generate proofs for each address
const proofs: Record<string, string[]> = {};
allowlist.forEach((addr, i) => {
  const proof = tree.getHexProof(leaves[i]);
  proofs[ethers.getAddress(addr)] = proof;
});

// Save proofs (frontend needs these)
fs.writeFileSync(
  "./merkle-proofs.json",
  JSON.stringify({ root, proofs }, null, 2)
);

console.log(`\nProofs written to ./merkle-proofs.json`);
console.log(`Upload this file (or serve via API) for the mint page.\n`);
```

---

## scripts/deploy.ts

```typescript
/**
 * Deploy FoundingOperativeBadge to Base.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network baseSepolia  # testnet first
 *   npx hardhat run scripts/deploy.ts --network base          # mainnet
 */

import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\n🚨 Molt Cops Badge Deployment`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Deployer: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance:  ${ethers.formatEther(balance)} ETH`);

  // Load merkle root
  let merkleRoot: string;
  try {
    const merkleData = JSON.parse(
      fs.readFileSync("./merkle-proofs.json", "utf-8")
    );
    merkleRoot = merkleData.root;
    console.log(`Merkle Root: ${merkleRoot}`);
  } catch {
    // Default to empty root (admin-only minting)
    merkleRoot = ethers.ZeroHash;
    console.log(`⚠️  No merkle-proofs.json found. Using empty root (admin mint only).`);
  }

  // Deploy
  console.log(`\nDeploying...`);
  const Badge = await ethers.getContractFactory("FoundingOperativeBadge");
  const badge = await Badge.deploy(merkleRoot, deployer.address);
  await badge.waitForDeployment();

  const address = await badge.getAddress();
  console.log(`\n✅ Deployed: ${address}`);

  // Save deployment info
  const network = await ethers.provider.getNetwork();
  const deployment = {
    address,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    merkleRoot,
    timestamp: new Date().toISOString(),
    txHash: badge.deploymentTransaction()?.hash,
  };

  fs.writeFileSync(
    `./deployment-${network.chainId}.json`,
    JSON.stringify(deployment, null, 2)
  );

  console.log(`\nDeployment saved to ./deployment-${network.chainId}.json`);

  // Post-deployment setup
  console.log(`\n━━ Post-Deployment Steps ━━`);
  console.log(`1. Verify:  npx hardhat verify --network base ${address} "${merkleRoot}" "${deployer.address}"`);
  console.log(`2. Activate: Call setMintActive(true) to open minting`);
  console.log(`3. Update:  Set contract address in mint page config`);
  console.log(`4. Test:    Mint badge #001 to yourself with adminMint()`);
  console.log(``);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

---

## allowlist.json (template)

```json
[
  "0x0000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000002"
]
```

Replace with real addresses of approved operatives. Run `generate-merkle.ts`
after every update, then call `setMerkleRoot()` on the contract with the
new root.

---

## Gas Estimates (Base)

| Action | Gas | Cost @ 0.01 gwei |
|--------|-----|-------------------|
| Deploy contract | ~3.5M | ~$0.08 |
| Mint (with proof) | ~120K | ~$0.003 |
| Admin mint | ~110K | ~$0.002 |
| Set merkle root | ~45K | ~$0.001 |
| Toggle soulbound | ~45K | ~$0.001 |

Base L2 makes the entire 100-badge mint cost under $1 in gas.

---

## Integration: Badge → ERC-8004 Trusted Reviewers

After minting, call `getAllOperatives()` to get the current list of
badge holders. Feed this into MoltVault as the `trusted_clients` parameter:

```python
# Python (MoltVault integration)
from moltvault.erc8004 import Web3Provider

provider = Web3Provider(rpc_url="https://mainnet.base.org")
# Read badge holders from the NFT contract
operatives = badge_contract.functions.getAllOperatives().call()

vault = MoltVault(
    policy=policy,
    registry_provider=provider,
    trusted_clients=operatives,  # Badge holders = trusted reviewers
)
```

This closes the loop: badges → trusted reviewers → Sybil-resistant reputation → safer wallets for everyone.

---

## Test Checklist (pre-deployment)

```bash
npx hardhat test
```

- [ ] Mint with valid proof succeeds
- [ ] Mint without proof reverts `NotOnAllowlist`
- [ ] Double mint reverts `AlreadyMinted`
- [ ] Mint #101 reverts `MaxSupplyReached`
- [ ] Admin mint works without proof
- [ ] Soulbound toggle blocks transfers
- [ ] Soulbound allows minting
- [ ] tokenURI returns valid base64 JSON
- [ ] SVG renders correctly for badges #1, #50, #100
- [ ] getAllOperatives returns correct addresses
- [ ] isOperative returns true for holders
- [ ] Merkle root update works
- [ ] Role assignment works
