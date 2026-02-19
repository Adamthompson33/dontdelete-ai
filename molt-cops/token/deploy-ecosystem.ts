/**
 * ═══════════════════════════════════════════════════════════════
 *  $MCOP TOKEN ECOSYSTEM — FULL DEPLOYMENT SCRIPT
 *  Deploys: Token → Vesting → Staking → Cross-wires everything
 * ═══════════════════════════════════════════════════════════════
 *
 * Usage:
 *   npx hardhat run scripts/deploy-ecosystem.ts --network baseSepolia  # testnet
 *   npx hardhat run scripts/deploy-ecosystem.ts --network base          # mainnet
 *
 * Prerequisites:
 *   1. FoundingOperativeBadge already deployed (get address)
 *   2. Multisig wallet created for treasury (3/5 Safe)
 *   3. .env configured with DEPLOYER_PRIVATE_KEY and RPC URLs
 */

import { ethers } from "hardhat";
import * as fs from "fs";

// ── Configuration ──
// Update these before deployment
const CONFIG = {
  // Badge contract (already deployed)
  badgeContract: process.env.BADGE_CONTRACT || ethers.ZeroAddress,

  // Multisig addresses (create via Safe before deploying)
  treasuryMultisig: process.env.TREASURY_MULTISIG || "", // 3/5 multisig
  communityMultisig: process.env.COMMUNITY_MULTISIG || "", // Can be same as treasury initially

  // Vesting durations (seconds)
  TEAM_CLIFF: 365 * 24 * 60 * 60,         // 12 months
  TEAM_VEST: 3 * 365 * 24 * 60 * 60,      // 36 months
  OPERATIVE_CLIFF: 90 * 24 * 60 * 60,     // 3 months
  OPERATIVE_VEST: 18 * 30 * 24 * 60 * 60, // 18 months
  TREASURY_CLIFF: 0,                       // No cliff
  TREASURY_VEST: 4 * 365 * 24 * 60 * 60,  // 48 months
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log(`\n🚨 $MCOP ECOSYSTEM DEPLOYMENT`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Network:  ${network.name} (${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log(`Badge:    ${CONFIG.badgeContract}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Use deployer as fallback for multisigs in testing
  const treasury = CONFIG.treasuryMultisig || deployer.address;
  const community = CONFIG.communityMultisig || deployer.address;

  // ─── Step 1: Deploy Vesting Contract ───
  console.log("1/5 Deploying MCOPVesting...");
  const Vesting = await ethers.getContractFactory("MCOPVesting");
  // We need to deploy token first to reference it, but vesting needs token address...
  // Solution: deploy vesting with a placeholder, then deploy token pointing to vesting

  // Actually, let's deploy token first with vesting address = deployer (temporary)
  // Then deploy vesting pointing to token, then transfer tokens to vesting

  // ─── Step 1: Deploy Token ───
  console.log("1/5 Deploying MCOPToken...");
  const Token = await ethers.getContractFactory("MCOPToken");

  // For deployment, we'll use deployer as temporary holder for team + operative
  // allocations, then transfer to vesting contracts after they're deployed
  const token = await Token.deploy(
    community,            // Community & Ecosystem (40%)
    treasury,             // Treasury (20%)
    deployer.address,     // Team — temporary, will transfer to vesting
    deployer.address,     // Operative — temporary, will transfer to vesting
    deployer.address,     // Liquidity — temporary, will transfer to LP
    deployer.address,     // Fair Launch — temporary, will transfer to sale contract
  deployer.address      // Owner
  );
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log(`   ✅ MCOPToken: ${tokenAddr}`);

  // ─── Step 2: Deploy Vesting ───
  console.log("\n2/5 Deploying MCOPVesting...");
  const vesting = await Vesting.deploy(tokenAddr, deployer.address);
  await vesting.waitForDeployment();
  const vestingAddr = await vesting.getAddress();
  console.log(`   ✅ MCOPVesting: ${vestingAddr}`);

  // ─── Step 3: Deploy Staking ───
  console.log("\n3/5 Deploying ReputationStaking...");
  const Staking = await ethers.getContractFactory("ReputationStaking");
  const staking = await Staking.deploy(tokenAddr, CONFIG.badgeContract, deployer.address);
  await staking.waitForDeployment();
  const stakingAddr = await staking.getAddress();
  console.log(`   ✅ ReputationStaking: ${stakingAddr}`);

  // ─── Step 4: Fund Vesting Contracts ───
  console.log("\n4/5 Setting up vesting schedules...");

  // Transfer team allocation (15% = 15M) to vesting contract
  const DECIMALS = ethers.parseEther("1");
  const teamAllocation = ethers.parseEther("15000000");
  const operativeAllocation = ethers.parseEther("10000000");

  await token.transfer(vestingAddr, teamAllocation + operativeAllocation);
  console.log(`   Transferred ${ethers.formatEther(teamAllocation + operativeAllocation)} MCOP to vesting`);

  // Create team vesting schedule (single schedule for now — split per team member later)
  await vesting.createSchedule(
    treasury, // Team tokens vest to treasury multisig initially
    teamAllocation,
    CONFIG.TEAM_CLIFF,
    CONFIG.TEAM_VEST,
    true, // Revocable (team can be let go)
    "team"
  );
  console.log(`   Created team vesting: 15M MCOP, 12mo cliff, 36mo vest`);

  // Operative vesting will be created per-address when badges are minted
  // For now, create a master schedule to the community multisig
  await vesting.createSchedule(
    community,
    operativeAllocation,
    CONFIG.OPERATIVE_CLIFF,
    CONFIG.OPERATIVE_VEST,
    false, // Not revocable — operatives earned these
    "operative-pool"
  );
  console.log(`   Created operative vesting: 10M MCOP, 3mo cliff, 18mo vest`);

  // ─── Step 5: Seed Staking Reward Pool ───
  console.log("\n5/5 Seeding staking rewards...");

  // Seed with 1M MCOP from community allocation for initial staking rewards
  // (Community multisig will approve this in production via governance)
  // In test, deployer holds community tokens
  const seedAmount = ethers.parseEther("1000000"); // 1M MCOP
  await token.approve(stakingAddr, seedAmount);
  await staking.depositRewards(seedAmount);
  console.log(`   Deposited ${ethers.formatEther(seedAmount)} MCOP to staking rewards`);

  // ─── Summary ───
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🚨 DEPLOYMENT COMPLETE`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const deployment = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      MCOPToken: tokenAddr,
      MCOPVesting: vestingAddr,
      ReputationStaking: stakingAddr,
      FoundingOperativeBadge: CONFIG.badgeContract,
    },
    wallets: {
      treasury: treasury,
      community: community,
    },
    allocations: {
      community: ethers.formatEther(await token.balanceOf(community)),
      treasury: ethers.formatEther(await token.balanceOf(treasury)),
      vesting: ethers.formatEther(await token.balanceOf(vestingAddr)),
      staking: ethers.formatEther(await token.balanceOf(stakingAddr)),
      deployer: ethers.formatEther(await token.balanceOf(deployer.address)),
    },
  };

  console.log(`\nContract Addresses:`);
  console.log(`  MCOPToken:          ${tokenAddr}`);
  console.log(`  MCOPVesting:        ${vestingAddr}`);
  console.log(`  ReputationStaking:  ${stakingAddr}`);
  console.log(`  Badge:              ${CONFIG.badgeContract}`);

  console.log(`\nToken Allocations:`);
  Object.entries(deployment.allocations).forEach(([k, v]) => {
    console.log(`  ${k}: ${v} MCOP`);
  });

  // Save
  const filename = `./deployment-ecosystem-${network.chainId}.json`;
  fs.writeFileSync(filename, JSON.stringify(deployment, null, 2));
  console.log(`\nSaved to ${filename}`);

  // ─── Verification Commands ───
  console.log(`\n━━ VERIFICATION COMMANDS ━━`);
  console.log(`npx hardhat verify --network ${network.name} ${tokenAddr} "${community}" "${treasury}" "${deployer.address}" "${deployer.address}" "${deployer.address}" "${deployer.address}" "${deployer.address}"`);
  console.log(`npx hardhat verify --network ${network.name} ${vestingAddr} "${tokenAddr}" "${deployer.address}"`);
  console.log(`npx hardhat verify --network ${network.name} ${stakingAddr} "${tokenAddr}" "${CONFIG.badgeContract}" "${deployer.address}"`);

  // ─── Post-Deploy Checklist ───
  console.log(`\n━━ POST-DEPLOY CHECKLIST ━━`);
  console.log(`[ ] Verify all contracts on Basescan`);
  console.log(`[ ] Transfer remaining deployer tokens to appropriate wallets`);
  console.log(`[ ] Create individual operative vesting schedules when badges mint`);
  console.log(`[ ] Set up liquidity on Aerodrome/Uniswap V3`);
  console.log(`[ ] Transfer contract ownership to treasury multisig`);
  console.log(`[ ] Publish all addresses on the transparency dashboard`);
  console.log(`[ ] Run MoltShield scan on the deployed contracts (dogfooding)`);
  console.log(``);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
