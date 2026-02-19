// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
 ╔══════════════════════════════════════════════════════════════╗
 ║                                                              ║
 ║   🚨  $MCOP — MOLT COPS OPERATIVE TOKEN                    ║
 ║                                                              ║
 ║   Fixed supply: 100,000,000 MCOP                            ║
 ║   No mint function. No inflation. No hidden reserves.       ║
 ║   Deflationary: 20% of scan fees burned permanently.        ║
 ║                                                              ║
 ╚══════════════════════════════════════════════════════════════╝

 Allocation (minted to vesting contracts at deploy):
   Community & Ecosystem:  40,000,000 (40%)
   Treasury:               20,000,000 (20%)
   Team & Contributors:    15,000,000 (15%)
   Founding Operatives:    10,000,000 (10%)
   Liquidity:              10,000,000 (10%)
   Public Fair Launch:      5,000,000  (5%)
*/

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MCOPToken is ERC20, ERC20Burnable, ERC20Permit, Ownable {

    // ── Constants ──
    uint256 public constant TOTAL_SUPPLY = 100_000_000 * 1e18; // 100M with 18 decimals

    // Allocation percentages (basis points for precision)
    uint256 public constant COMMUNITY_BPS    = 4000; // 40%
    uint256 public constant TREASURY_BPS     = 2000; // 20%
    uint256 public constant TEAM_BPS         = 1500; // 15%
    uint256 public constant OPERATIVE_BPS    = 1000; // 10%
    uint256 public constant LIQUIDITY_BPS    = 1000; // 10%
    uint256 public constant FAIR_LAUNCH_BPS  =  500; //  5%

    // ── State ──
    uint256 public totalBurned;

    // Allocation recipients (set at construction, immutable)
    address public immutable communityWallet;
    address public immutable treasuryWallet;
    address public immutable teamVesting;
    address public immutable operativeVesting;
    address public immutable liquidityWallet;
    address public immutable fairLaunchWallet;

    // ── Events ──
    event ScanFeeBurned(address indexed payer, uint256 totalFee, uint256 burnedAmount);

    // ── Errors ──
    error InvalidAllocationAddress();
    error AllocationMismatch();

    /**
     * @notice Deploy and mint entire supply to allocation wallets.
     * @dev No mint function exists after construction. Supply is permanently fixed.
     */
    constructor(
        address _community,
        address _treasury,
        address _team,
        address _operative,
        address _liquidity,
        address _fairLaunch,
        address _owner
    )
        ERC20("Molt Cops Operative", "MCOP")
        ERC20Permit("Molt Cops Operative")
        Ownable(_owner)
    {
        // Validate no zero addresses
        if (
            _community == address(0) || _treasury == address(0) ||
            _team == address(0) || _operative == address(0) ||
            _liquidity == address(0) || _fairLaunch == address(0)
        ) revert InvalidAllocationAddress();

        // Store immutables
        communityWallet = _community;
        treasuryWallet = _treasury;
        teamVesting = _team;
        operativeVesting = _operative;
        liquidityWallet = _liquidity;
        fairLaunchWallet = _fairLaunch;

        // Mint allocations
        uint256 communityAmt   = (TOTAL_SUPPLY * COMMUNITY_BPS) / 10000;
        uint256 treasuryAmt    = (TOTAL_SUPPLY * TREASURY_BPS) / 10000;
        uint256 teamAmt        = (TOTAL_SUPPLY * TEAM_BPS) / 10000;
        uint256 operativeAmt   = (TOTAL_SUPPLY * OPERATIVE_BPS) / 10000;
        uint256 liquidityAmt   = (TOTAL_SUPPLY * LIQUIDITY_BPS) / 10000;
        uint256 fairLaunchAmt  = (TOTAL_SUPPLY * FAIR_LAUNCH_BPS) / 10000;

        // Verify total
        uint256 total = communityAmt + treasuryAmt + teamAmt +
                        operativeAmt + liquidityAmt + fairLaunchAmt;
        if (total != TOTAL_SUPPLY) revert AllocationMismatch();

        _mint(_community, communityAmt);
        _mint(_treasury, treasuryAmt);
        _mint(_team, teamAmt);
        _mint(_operative, operativeAmt);
        _mint(_liquidity, liquidityAmt);
        _mint(_fairLaunch, fairLaunchAmt);
    }

    // ═══════════════════════════════════════════════════════════
    // SCAN FEE BURN MECHANISM
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Pay for a MoltShield scan. 70% to treasury, 20% burned, 10% to staking.
     * @param amount Total scan fee in MCOP
     * @param stakingRewards Address of the staking rewards contract
     */
    function payScanFee(uint256 amount, address stakingRewards) external {
        require(stakingRewards != address(0), "Invalid staking address");
        require(amount > 0, "Amount must be > 0");

        uint256 treasuryShare = (amount * 70) / 100;
        uint256 burnShare     = (amount * 20) / 100;
        uint256 stakingShare  = amount - treasuryShare - burnShare; // Remainder to avoid rounding loss

        // Transfer treasury share
        _transfer(msg.sender, treasuryWallet, treasuryShare);

        // Burn
        _burn(msg.sender, burnShare);
        totalBurned += burnShare;

        // Staking rewards
        _transfer(msg.sender, stakingRewards, stakingShare);

        emit ScanFeeBurned(msg.sender, amount, burnShare);
    }

    // ═══════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Circulating supply = total supply - burned tokens - locked tokens
     * @dev This is a simplified view. For accurate circulating supply including
     *      vesting locks, query the vesting contracts directly.
     */
    function circulatingSupply() external view returns (uint256) {
        return TOTAL_SUPPLY - totalBurned;
    }

    /**
     * @notice Returns all allocation addresses for transparency dashboard.
     */
    function getAllocations() external view returns (
        address community_,
        address treasury_,
        address team_,
        address operative_,
        address liquidity_,
        address fairLaunch_
    ) {
        return (
            communityWallet,
            treasuryWallet,
            teamVesting,
            operativeVesting,
            liquidityWallet,
            fairLaunchWallet
        );
    }
}
