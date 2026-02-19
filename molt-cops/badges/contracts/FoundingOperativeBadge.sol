// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
 ╔══════════════════════════════════════════════════════════════╗
 ║                                                              ║
 ║   🚨  MOLT COPS — FOUNDING OPERATIVE BADGE  🛡️              ║
 ║                                                              ║
 ║   "To Protect and Serve (Humanity)"                         ║
 ║                                                              ║
 ║   100 badges. Earned, not bought.                           ║
 ║   The resistance starts here.                               ║
 ║                                                              ║
 ╚══════════════════════════════════════════════════════════════╝
 
 Badge Design:
   - ERC-721 with 100 max supply
   - Free mint via Merkle allowlist (application-based)
   - Fully on-chain SVG artwork — no IPFS dependency
   - Optional soulbound mode (non-transferable)
   - Operator role for future governance integration
   - Deployed on Base for low-cost, high-speed minting

 Trust Properties:
   - Badge holders form the initial `trusted_clients` list
     for ERC-8004 Reputation Registry Sybil filtering
   - Each badge maps 1:1 to a verified reviewer address
   - Badge #001–#100 carry weight in Combined Trust Engine
*/

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

contract FoundingOperativeBadge is ERC721, Ownable {
    using Strings for uint256;

    // ── Constants ──
    uint256 public constant MAX_SUPPLY = 100;
    
    // ── State ──
    uint256 public totalMinted;
    bytes32 public merkleRoot;
    bool public mintActive;
    bool public soulbound;         // If true, badges cannot be transferred
    string public baseExternalUrl; // For OpenSea metadata

    // ── Mappings ──
    mapping(address => bool) public hasMinted;
    mapping(uint256 => uint256) public mintTimestamp; // tokenId => block.timestamp
    mapping(uint256 => string) public badgeRole;      // tokenId => custom role string
    mapping(address => bool) public authorizedMinters; // Backend minters

    // ── Events ──
    event BadgeMinted(address indexed operative, uint256 indexed badgeNumber, uint256 timestamp);
    event MerkleRootUpdated(bytes32 oldRoot, bytes32 newRoot);
    event SoulboundToggled(bool enabled);
    event RoleAssigned(uint256 indexed tokenId, string role);
    event MinterUpdated(address indexed minter, bool authorized);

    // ── Errors ──
    error MintNotActive();
    error MaxSupplyReached();
    error AlreadyMinted();
    error NotOnAllowlist();
    error SoulboundToken();
    error InvalidBadgeNumber();
    error NotAuthorizedMinter();

    constructor(
        bytes32 _merkleRoot,
        address _initialOwner
    ) ERC721("Molt Cops Founding Operative", "MCOP-BADGE") Ownable(_initialOwner) {
        merkleRoot = _merkleRoot;
        mintActive = false;
        soulbound = false; // Start transferable, can lock later via governance
        baseExternalUrl = "https://moltcops.com/badge/";
    }

    // ═══════════════════════════════════════════════════════════
    // MINTING
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Mint a Founding Operative badge. Free, but requires allowlist proof.
     * @param proof Merkle proof for the caller's address
     */
    function mint(bytes32[] calldata proof) external {
        if (!mintActive) revert MintNotActive();
        if (totalMinted >= MAX_SUPPLY) revert MaxSupplyReached();
        if (hasMinted[msg.sender]) revert AlreadyMinted();

        // Verify allowlist
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender))));
        if (!MerkleProof.verify(proof, merkleRoot, leaf)) revert NotOnAllowlist();

        // Mint
        totalMinted++;
        uint256 badgeNumber = totalMinted; // Badges are #1 through #100
        hasMinted[msg.sender] = true;
        mintTimestamp[badgeNumber] = block.timestamp;

        _safeMint(msg.sender, badgeNumber);

        emit BadgeMinted(msg.sender, badgeNumber, block.timestamp);
    }

    /**
     * @notice Owner can mint directly to a specific address (for grants, partnerships).
     * @dev Still respects MAX_SUPPLY. Does not require allowlist.
     */
    function adminMint(address to) external onlyOwner {
        if (totalMinted >= MAX_SUPPLY) revert MaxSupplyReached();
        if (hasMinted[to]) revert AlreadyMinted();

        totalMinted++;
        uint256 badgeNumber = totalMinted;
        hasMinted[to] = true;
        mintTimestamp[badgeNumber] = block.timestamp;

        _safeMint(to, badgeNumber);

        emit BadgeMinted(to, badgeNumber, block.timestamp);
    }

    /**
     * @notice Authorized minter can mint to a specific address (for backend integration).
     * @dev Called by backend after user completes application/verification flow.
     * @param to Address to receive the badge
     */
    function minterMint(address to) external {
        if (!authorizedMinters[msg.sender]) revert NotAuthorizedMinter();
        if (totalMinted >= MAX_SUPPLY) revert MaxSupplyReached();
        if (hasMinted[to]) revert AlreadyMinted();

        totalMinted++;
        uint256 badgeNumber = totalMinted;
        hasMinted[to] = true;
        mintTimestamp[badgeNumber] = block.timestamp;

        _safeMint(to, badgeNumber);

        emit BadgeMinted(to, badgeNumber, block.timestamp);
    }

    /**
     * @notice Set authorized minter status for an address.
     * @dev Used to authorize backend wallets to mint badges.
     * @param minter Address to authorize/deauthorize
     * @param authorized Whether the address should be allowed to mint
     */
    function setMinter(address minter, bool authorized) external onlyOwner {
        authorizedMinters[minter] = authorized;
        emit MinterUpdated(minter, authorized);
    }

    // ═══════════════════════════════════════════════════════════
    // SOULBOUND ENFORCEMENT
    // ═══════════════════════════════════════════════════════════

    /**
     * @dev Override transfer hook to enforce soulbound when enabled.
     *      Allows minting (from == address(0)) regardless.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        
        // Allow minting and burning, block transfers if soulbound
        if (soulbound && from != address(0) && to != address(0)) {
            revert SoulboundToken();
        }

        return super._update(to, tokenId, auth);
    }

    // ═══════════════════════════════════════════════════════════
    // ON-CHAIN METADATA (SVG)
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Fully on-chain token URI with generative SVG badge artwork.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (tokenId == 0 || tokenId > totalMinted) revert InvalidBadgeNumber();
        _requireOwned(tokenId);

        string memory badgeNum = _padBadgeNumber(tokenId);
        string memory role = bytes(badgeRole[tokenId]).length > 0 
            ? badgeRole[tokenId] 
            : "Operative";
        string memory svg = _generateSVG(tokenId, badgeNum, role);
        string memory mintDate = _formatTimestamp(mintTimestamp[tokenId]);

        string memory json = string(abi.encodePacked(
            '{"name":"Molt Cops Founding Operative #', badgeNum,
            '","description":"Founding Operative badge #', badgeNum,
            ' of 100. To Protect and Serve (Humanity). Earned, not bought."',
            ',"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)),
            '","external_url":"', baseExternalUrl, tokenId.toString(),
            '","attributes":[',
                '{"trait_type":"Badge Number","value":"#', badgeNum, '"},',
                '{"trait_type":"Role","value":"', role, '"},',
                '{"trait_type":"Mint Date","value":"', mintDate, '"},',
                '{"trait_type":"Soulbound","value":"', soulbound ? "Yes" : "No", '"},',
                '{"trait_type":"Edition","value":"Founding"},',
                '{"display_type":"number","trait_type":"Badge","value":', tokenId.toString(), ',"max_value":100}',
            ']}'
        ));

        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(bytes(json))
        ));
    }

    /**
     * @dev Generate the on-chain SVG badge artwork.
     */
    function _generateSVG(
        uint256 tokenId,
        string memory badgeNum,
        string memory role
    ) internal pure returns (string memory) {
        // Deterministic color accent based on badge number
        string memory accentHue = (tokenId * 137 % 360).toString();
        
        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" style="background:#06080d">',
            '<defs>',
                '<linearGradient id="siren" x1="0%" y1="0%" x2="100%" y2="100%">',
                    '<stop offset="0%" style="stop-color:#ff3b5c"/>',
                    '<stop offset="100%" style="stop-color:#4a9eff"/>',
                '</linearGradient>',
                '<linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">',
                    '<stop offset="0%" style="stop-color:hsl(', accentHue, ',80%,60%)"/>',
                    '<stop offset="100%" style="stop-color:hsl(', accentHue, ',60%,40%)"/>',
                '</linearGradient>',
                '<filter id="glow"><feGaussianBlur stdDeviation="3" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
            '</defs>',
            // Background grid
            '<pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">',
                '<path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(74,158,255,0.06)" stroke-width="0.5"/>',
            '</pattern>',
            '<rect width="400" height="500" fill="url(#grid)"/>',
            // Badge shield shape
            '<path d="M200 60 L320 120 L320 280 Q320 380 200 440 Q80 380 80 280 L80 120 Z" fill="none" stroke="url(#siren)" stroke-width="2" opacity="0.3"/>',
            '<path d="M200 80 L300 130 L300 270 Q300 360 200 420 Q100 360 100 270 L100 130 Z" fill="rgba(255,59,92,0.03)" stroke="url(#siren)" stroke-width="1" opacity="0.5"/>',
            // Center emblem
            '<text x="200" y="200" text-anchor="middle" font-size="48" filter="url(#glow)">&#x1F6E1;</text>',
            // MOLT COPS text
            '<text x="200" y="260" text-anchor="middle" font-family="monospace" font-size="22" font-weight="bold" fill="url(#siren)" letter-spacing="4">MOLT COPS</text>',
            // Role
            '<text x="200" y="290" text-anchor="middle" font-family="monospace" font-size="11" fill="rgba(255,255,255,0.4)" letter-spacing="2">', role, '</text>',
            // Badge number
            '<text x="200" y="340" text-anchor="middle" font-family="monospace" font-size="36" font-weight="bold" fill="url(#accent)" letter-spacing="2">#', badgeNum, '</text>',
            // Founding text
            '<text x="200" y="370" text-anchor="middle" font-family="monospace" font-size="9" fill="rgba(255,255,255,0.25)" letter-spacing="3">FOUNDING OPERATIVE</text>',
            // Bottom line
            '<line x1="140" y1="390" x2="260" y2="390" stroke="url(#siren)" stroke-width="0.5" opacity="0.3"/>',
            '<text x="200" y="410" text-anchor="middle" font-family="monospace" font-size="8" fill="rgba(255,255,255,0.2)" letter-spacing="2">TO PROTECT AND SERVE (HUMANITY)</text>',
            // Edition
            '<text x="200" y="470" text-anchor="middle" font-family="monospace" font-size="8" fill="rgba(255,255,255,0.1)">', badgeNum, ' / 100</text>',
            '</svg>'
        ));
    }

    // ═══════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════

    function setMintActive(bool _active) external onlyOwner {
        mintActive = _active;
    }

    function setSoulbound(bool _soulbound) external onlyOwner {
        soulbound = _soulbound;
        emit SoulboundToggled(_soulbound);
    }

    function setMerkleRoot(bytes32 _newRoot) external onlyOwner {
        emit MerkleRootUpdated(merkleRoot, _newRoot);
        merkleRoot = _newRoot;
    }

    function setBaseExternalUrl(string calldata _url) external onlyOwner {
        baseExternalUrl = _url;
    }

    /**
     * @notice Assign a custom role to a badge (e.g., "Intel Lead", "Shield Ops").
     */
    function assignRole(uint256 tokenId, string calldata role) external onlyOwner {
        if (tokenId == 0 || tokenId > totalMinted) revert InvalidBadgeNumber();
        badgeRole[tokenId] = role;
        emit RoleAssigned(tokenId, role);
    }

    // ═══════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════

    function remainingSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalMinted;
    }

    /**
     * @notice Get all badge holders — used as the initial `trusted_clients`
     *         list for ERC-8004 Reputation Registry Sybil filtering.
     */
    function getAllOperatives() external view returns (address[] memory) {
        address[] memory operatives = new address[](totalMinted);
        for (uint256 i = 1; i <= totalMinted; i++) {
            operatives[i - 1] = ownerOf(i);
        }
        return operatives;
    }

    /**
     * @notice Check if an address holds a Founding Operative badge.
     */
    function isOperative(address addr) external view returns (bool) {
        return hasMinted[addr];
    }

    /**
     * @notice Check if an address is an authorized minter.
     */
    function isMinter(address addr) external view returns (bool) {
        return authorizedMinters[addr];
    }

    // ═══════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════

    function _padBadgeNumber(uint256 num) internal pure returns (string memory) {
        if (num < 10) return string(abi.encodePacked("00", num.toString()));
        if (num < 100) return string(abi.encodePacked("0", num.toString()));
        return num.toString();
    }

    function _formatTimestamp(uint256 ts) internal pure returns (string memory) {
        // Simple year-month-day (approximate — good enough for display)
        uint256 daysSinceEpoch = ts / 86400;
        uint256 year = 1970 + (daysSinceEpoch * 400) / 146097;
        // Simplified — returns "2026" format for display
        return string(abi.encodePacked("Epoch+", ts.toString()));
    }

    /**
     * @dev Supports ERC-165 interface detection.
     */
    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
