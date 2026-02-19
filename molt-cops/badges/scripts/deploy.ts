/**
 * Deploy FoundingOperativeBadge to Base.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network baseSepolia  # testnet first
 *   npx hardhat run scripts/deploy.ts --network base          # mainnet
 *
 * Environment:
 *   DEPLOYER_PRIVATE_KEY - Private key of deployer (will be owner)
 *   MINTER_ADDRESS       - (Optional) Backend minter address to authorize
 */

import { ethers, run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log(`\n🚨 MOLT COPS — Founding Operative Badge Deployment`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Network:  ${network.name}`);
  console.log(`Chain ID: ${network.config.chainId}`);
  console.log(`Deployer: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance:  ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.error("\n❌ Deployer has no ETH. Fund the wallet first.");
    process.exit(1);
  }

  // Load merkle root from generated proofs
  let merkleRoot: string;
  const merkleProofsPath = path.join(__dirname, "..", "merkle-proofs.json");

  try {
    const merkleData = JSON.parse(fs.readFileSync(merkleProofsPath, "utf-8"));
    merkleRoot = merkleData.root;
    console.log(`\nMerkle Root: ${merkleRoot}`);
    console.log(`Allowlist addresses: ${Object.keys(merkleData.proofs).length}`);
  } catch {
    // Default to empty root (admin-only minting)
    merkleRoot = ethers.ZeroHash;
    console.log(
      `\n⚠️  No merkle-proofs.json found. Using empty root (admin mint only).`
    );
    console.log(`   Run 'npm run merkle' to generate from allowlist.json`);
  }

  // Deploy
  console.log(`\n📦 Deploying contract...`);
  const Badge = await ethers.getContractFactory("FoundingOperativeBadge");
  const badge = await Badge.deploy(merkleRoot, deployer.address);
  await badge.waitForDeployment();

  const contractAddress = await badge.getAddress();
  console.log(`\n✅ Deployed: ${contractAddress}`);

  // Get deployment transaction
  const deployTx = badge.deploymentTransaction();
  if (deployTx) {
    console.log(`   Tx Hash: ${deployTx.hash}`);
    const receipt = await deployTx.wait();
    console.log(`   Gas Used: ${receipt?.gasUsed.toString()}`);
  }

  // Authorize backend minter if provided
  const minterAddress = process.env.MINTER_ADDRESS;
  if (minterAddress && ethers.isAddress(minterAddress)) {
    console.log(`\n🔐 Authorizing minter: ${minterAddress}`);
    const tx = await badge.setMinter(minterAddress, true);
    await tx.wait();
    console.log(`   ✅ Minter authorized`);
  }

  // Save deployment info
  const networkInfo = await ethers.provider.getNetwork();
  const deployment = {
    contract: "FoundingOperativeBadge",
    address: contractAddress,
    chainId: Number(networkInfo.chainId),
    network: network.name,
    deployer: deployer.address,
    minter: minterAddress || null,
    merkleRoot,
    timestamp: new Date().toISOString(),
    txHash: deployTx?.hash,
    blockNumber: deployTx ? (await deployTx.wait())?.blockNumber : null,
  };

  const deploymentPath = path.join(
    __dirname,
    "..",
    `deployment-${networkInfo.chainId}.json`
  );
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log(`\n💾 Deployment saved to ${deploymentPath}`);

  // Verify on Basescan (skip for local/testnet if no API key)
  if (
    network.name !== "hardhat" &&
    network.name !== "localhost" &&
    process.env.BASESCAN_API_KEY
  ) {
    console.log(`\n🔍 Verifying on Basescan...`);
    console.log(`   Waiting 30s for indexing...`);
    await sleep(30000);

    try {
      await run("verify:verify", {
        address: contractAddress,
        constructorArguments: [merkleRoot, deployer.address],
      });
      console.log(`   ✅ Verified on Basescan`);
    } catch (error: any) {
      if (error.message.includes("Already Verified")) {
        console.log(`   ✅ Already verified`);
      } else {
        console.log(`   ⚠️  Verification failed: ${error.message}`);
        console.log(`   Run manually:`);
        console.log(
          `   npx hardhat verify --network ${network.name} ${contractAddress} "${merkleRoot}" "${deployer.address}"`
        );
      }
    }
  }

  // Post-deployment summary
  console.log(`\n━━ POST-DEPLOYMENT CHECKLIST ━━`);
  console.log(`\n1. 📋 Contract Setup:`);
  console.log(`   - Call setMintActive(true) to open minting`);
  console.log(`   - Call setSoulbound(true) to make badges non-transferable`);
  console.log(`   - Mint badge #001 to yourself: adminMint(${deployer.address})`);

  console.log(`\n2. 🔧 Backend Integration:`);
  console.log(`   - Set BADGE_CONTRACT_ADDRESS=${contractAddress}`);
  if (minterAddress) {
    console.log(`   - Minter wallet is authorized: ${minterAddress}`);
  } else {
    console.log(`   - Call setMinter(<backend_wallet>, true) to authorize`);
  }
  console.log(`   - Backend calls: minterMint(recipient) for each new operative`);

  console.log(`\n3. 🌐 Frontend Integration:`);
  console.log(`   - Update contract address in mint page config`);
  console.log(`   - Serve merkle-proofs.json for allowlist verification`);

  if (network.name === "baseSepolia") {
    console.log(`\n4. 🧪 Testnet Only:`);
    console.log(`   - Test all mint flows before mainnet`);
    console.log(`   - Verify tokenURI returns valid metadata`);
    console.log(`   - When ready: npm run deploy:mainnet`);
  }

  console.log(`\n🎉 Deployment complete!\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
