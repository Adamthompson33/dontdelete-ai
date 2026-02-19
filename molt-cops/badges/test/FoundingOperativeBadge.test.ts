import { expect } from "chai";
import { ethers } from "hardhat";
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import { FoundingOperativeBadge } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("FoundingOperativeBadge", function () {
  let badge: FoundingOperativeBadge;
  let owner: HardhatEthersSigner;
  let minter: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let user3: HardhatEthersSigner;
  let merkleRoot: string;
  let tree: MerkleTree;
  let allowlist: string[];

  // Helper to create merkle proof
  function getProof(address: string): string[] {
    const packed = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address"],
      [address]
    );
    const leaf = keccak256(keccak256(packed));
    return tree.getHexProof(leaf);
  }

  beforeEach(async function () {
    [owner, minter, user1, user2, user3] = await ethers.getSigners();

    // Create allowlist with user1 and user2
    allowlist = [user1.address, user2.address];

    // Generate merkle tree
    const leaves = allowlist.map((addr) => {
      const packed = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address"],
        [addr]
      );
      return keccak256(keccak256(packed));
    });
    tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    merkleRoot = tree.getHexRoot();

    // Deploy
    const Badge = await ethers.getContractFactory("FoundingOperativeBadge");
    badge = await Badge.deploy(merkleRoot, owner.address);
    await badge.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await badge.owner()).to.equal(owner.address);
    });

    it("Should set the correct merkle root", async function () {
      expect(await badge.merkleRoot()).to.equal(merkleRoot);
    });

    it("Should have mint inactive by default", async function () {
      expect(await badge.mintActive()).to.equal(false);
    });

    it("Should have soulbound off by default", async function () {
      expect(await badge.soulbound()).to.equal(false);
    });

    it("Should have 100 max supply", async function () {
      expect(await badge.MAX_SUPPLY()).to.equal(100);
    });
  });

  describe("Allowlist Minting", function () {
    beforeEach(async function () {
      await badge.setMintActive(true);
    });

    it("Should allow allowlisted user to mint", async function () {
      const proof = getProof(user1.address);
      await badge.connect(user1).mint(proof);

      expect(await badge.totalMinted()).to.equal(1);
      expect(await badge.ownerOf(1)).to.equal(user1.address);
      expect(await badge.hasMinted(user1.address)).to.equal(true);
    });

    it("Should reject non-allowlisted user", async function () {
      const proof = getProof(user3.address); // user3 not in allowlist
      await expect(badge.connect(user3).mint(proof)).to.be.revertedWithCustomError(
        badge,
        "NotOnAllowlist"
      );
    });

    it("Should reject double mint", async function () {
      const proof = getProof(user1.address);
      await badge.connect(user1).mint(proof);

      await expect(badge.connect(user1).mint(proof)).to.be.revertedWithCustomError(
        badge,
        "AlreadyMinted"
      );
    });

    it("Should reject when mint not active", async function () {
      await badge.setMintActive(false);
      const proof = getProof(user1.address);

      await expect(badge.connect(user1).mint(proof)).to.be.revertedWithCustomError(
        badge,
        "MintNotActive"
      );
    });
  });

  describe("Admin Minting", function () {
    it("Should allow owner to admin mint", async function () {
      await badge.adminMint(user3.address);

      expect(await badge.totalMinted()).to.equal(1);
      expect(await badge.ownerOf(1)).to.equal(user3.address);
    });

    it("Should reject admin mint from non-owner", async function () {
      await expect(badge.connect(user1).adminMint(user3.address)).to.be.revertedWithCustomError(
        badge,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  describe("Minter Role", function () {
    beforeEach(async function () {
      await badge.setMinter(minter.address, true);
    });

    it("Should authorize minter", async function () {
      expect(await badge.isMinter(minter.address)).to.equal(true);
    });

    it("Should allow authorized minter to mint", async function () {
      await badge.connect(minter).minterMint(user3.address);

      expect(await badge.totalMinted()).to.equal(1);
      expect(await badge.ownerOf(1)).to.equal(user3.address);
    });

    it("Should reject unauthorized minter", async function () {
      await expect(
        badge.connect(user1).minterMint(user3.address)
      ).to.be.revertedWithCustomError(badge, "NotAuthorizedMinter");
    });

    it("Should allow revoking minter", async function () {
      await badge.setMinter(minter.address, false);
      expect(await badge.isMinter(minter.address)).to.equal(false);

      await expect(
        badge.connect(minter).minterMint(user3.address)
      ).to.be.revertedWithCustomError(badge, "NotAuthorizedMinter");
    });

    it("Should prevent double mint via minter", async function () {
      await badge.connect(minter).minterMint(user3.address);

      await expect(
        badge.connect(minter).minterMint(user3.address)
      ).to.be.revertedWithCustomError(badge, "AlreadyMinted");
    });
  });

  describe("Soulbound", function () {
    beforeEach(async function () {
      await badge.adminMint(user1.address);
    });

    it("Should allow transfer when not soulbound", async function () {
      await badge.connect(user1).transferFrom(user1.address, user2.address, 1);
      expect(await badge.ownerOf(1)).to.equal(user2.address);
    });

    it("Should block transfer when soulbound", async function () {
      await badge.setSoulbound(true);

      await expect(
        badge.connect(user1).transferFrom(user1.address, user2.address, 1)
      ).to.be.revertedWithCustomError(badge, "SoulboundToken");
    });

    it("Should still allow minting when soulbound", async function () {
      await badge.setSoulbound(true);
      await badge.adminMint(user2.address);

      expect(await badge.ownerOf(2)).to.equal(user2.address);
    });
  });

  describe("Token URI", function () {
    beforeEach(async function () {
      await badge.adminMint(user1.address);
    });

    it("Should return base64 encoded JSON", async function () {
      const uri = await badge.tokenURI(1);
      expect(uri.startsWith("data:application/json;base64,")).to.equal(true);

      // Decode and verify structure
      const json = Buffer.from(
        uri.replace("data:application/json;base64,", ""),
        "base64"
      ).toString();
      const metadata = JSON.parse(json);

      expect(metadata.name).to.equal("Molt Cops Founding Operative #001");
      expect(metadata.attributes).to.be.an("array");
    });

    it("Should reject tokenURI for non-existent token", async function () {
      await expect(badge.tokenURI(99)).to.be.revertedWithCustomError(
        badge,
        "InvalidBadgeNumber"
      );
    });
  });

  describe("Views", function () {
    beforeEach(async function () {
      await badge.adminMint(user1.address);
      await badge.adminMint(user2.address);
    });

    it("Should return remaining supply", async function () {
      expect(await badge.remainingSupply()).to.equal(98);
    });

    it("Should return all operatives", async function () {
      const operatives = await badge.getAllOperatives();
      expect(operatives.length).to.equal(2);
      expect(operatives[0]).to.equal(user1.address);
      expect(operatives[1]).to.equal(user2.address);
    });

    it("Should check if address is operative", async function () {
      expect(await badge.isOperative(user1.address)).to.equal(true);
      expect(await badge.isOperative(user3.address)).to.equal(false);
    });
  });

  describe("Roles", function () {
    beforeEach(async function () {
      await badge.adminMint(user1.address);
    });

    it("Should assign role", async function () {
      await badge.assignRole(1, "Intel Lead");
      expect(await badge.badgeRole(1)).to.equal("Intel Lead");
    });

    it("Should reflect role in tokenURI", async function () {
      await badge.assignRole(1, "Shield Ops");
      const uri = await badge.tokenURI(1);
      const json = Buffer.from(
        uri.replace("data:application/json;base64,", ""),
        "base64"
      ).toString();
      const metadata = JSON.parse(json);

      const roleAttr = metadata.attributes.find(
        (a: any) => a.trait_type === "Role"
      );
      expect(roleAttr.value).to.equal("Shield Ops");
    });
  });
});
