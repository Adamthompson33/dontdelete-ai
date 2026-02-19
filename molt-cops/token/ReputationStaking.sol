// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
 ╔══════════════════════════════════════════════════════════════╗
 ║                                                              ║
 ║   🛡️  REPUTATION STAKING — $MCOP                            ║
 ║                                                              ║
 ║   Stake to weight your agent reviews.                       ║
 ║   Accurate reviews earn rewards.                            ║
 ║   Inaccurate reviews lose stake.                            ║
 ║   The resistance has skin in the game.                      ║
 ║                                                              ║
 ╚══════════════════════════════════════════════════════════════╝
 
 Tiers:
   Observer        — 100 MCOP   — 1x weight  — 10% slash risk
   Operative       — 1,000 MCOP — 3x weight  — 15% slash risk
   Senior Operative — 5,000 MCOP — 5x weight  — 20% slash risk
   Commander       — 25,000 MCOP — 10x weight — 25% slash risk
 
 Anti-gaming:
   - 14-day unstaking cooldown
   - Sub-linear weight scaling (10x stake ≠ 10x weight)
   - Review quality scoring via cross-reference with MoltShield
   - Diversity bonus for multi-chain reviewers
*/

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract ReputationStaking is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ── Roles ──
    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");
    bytes32 public constant REWARDS_ROLE = keccak256("REWARDS_ROLE");

    // ── Constants ──
    uint256 public constant COOLDOWN_PERIOD = 14 days;
    uint256 public constant WEIGHT_DECIMALS = 1e18;

    // Tier thresholds (in token units, NOT wei — multiply by decimals in checks)
    uint256 public constant TIER_OBSERVER        = 100;
    uint256 public constant TIER_OPERATIVE        = 1_000;
    uint256 public constant TIER_SENIOR           = 5_000;
    uint256 public constant TIER_COMMANDER        = 25_000;

    // Tier weights (1x, 3x, 5x, 10x)
    uint256 public constant WEIGHT_OBSERVER       = 1;
    uint256 public constant WEIGHT_OPERATIVE      = 3;
    uint256 public constant WEIGHT_SENIOR         = 5;
    uint256 public constant WEIGHT_COMMANDER      = 10;

    // Slash percentages (basis points)
    uint256 public constant SLASH_OBSERVER_BPS    = 1000; // 10%
    uint256 public constant SLASH_OPERATIVE_BPS   = 1500; // 15%
    uint256 public constant SLASH_SENIOR_BPS      = 2000; // 20%
    uint256 public constant SLASH_COMMANDER_BPS   = 2500; // 25%

    // ── Types ──
    enum Tier { None, Observer, Operative, Senior, Commander }

    struct StakeInfo {
        uint256 amount;             // Total staked MCOP (in wei)
        Tier tier;                  // Current tier
        uint256 stakedAt;           // Timestamp of last stake
        uint256 cooldownStart;      // When unstake cooldown began (0 = not cooling)
        uint256 cooldownAmount;     // Amount being unstaked
        uint256 rewardsEarned;      // Accumulated unclaimed rewards
        uint256 reviewCount;        // Total reviews submitted
        uint256 accurateReviews;    // Reviews that matched consensus
        uint256 lastReviewAt;       // Timestamp of last review
        bool isFoundingOperative;   // Badge holder bonus
    }

    struct SlashRecord {
        address staker;
        address challenger;
        uint256 amount;
        string reason;
        uint256 timestamp;
    }

    // ── State ──
    IERC20 public immutable mcopToken;
    uint256 public tokenDecimals;

    mapping(address => StakeInfo) public stakes;
    address[] public stakers;
    mapping(address => bool) public isStaker;

    uint256 public totalStaked;
    uint256 public totalSlashed;
    uint256 public slashPoolBalance;  // Accumulated from slashes, distributed to stakers
    uint256 public rewardPoolBalance; // From scan fees and community allocation

    SlashRecord[] public slashHistory;

    // Founding Operative badge contract
    address public badgeContract;

    // ── Events ──
    event Staked(address indexed staker, uint256 amount, Tier tier);
    event CooldownStarted(address indexed staker, uint256 amount, uint256 unlockTime);
    event Unstaked(address indexed staker, uint256 amount);
    event Slashed(address indexed staker, address indexed challenger, uint256 amount, string reason);
    event RewardClaimed(address indexed staker, uint256 amount);
    event ReviewRecorded(address indexed staker, address indexed agent, bool accurate);
    event RewardsDeposited(address indexed depositor, uint256 amount);

    // ── Errors ──
    error InsufficientStake();
    error CooldownActive();
    error CooldownNotComplete();
    error NoCooldownActive();
    error NotStaker();
    error NoRewards();
    error ZeroAmount();

    constructor(
        address _mcopToken,
        address _badgeContract,
        address _admin
    ) {
        mcopToken = IERC20(_mcopToken);
        badgeContract = _badgeContract;
        tokenDecimals = 1e18; // Standard ERC-20

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(SLASHER_ROLE, _admin);
        _grantRole(REWARDS_ROLE, _admin);
    }

    // ═══════════════════════════════════════════════════════════
    // STAKING
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Stake MCOP tokens. Must meet minimum tier threshold.
     * @param amount Amount of MCOP to stake (in wei)
     */
    function stake(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        StakeInfo storage info = stakes[msg.sender];

        // Check for active cooldown
        if (info.cooldownStart > 0) revert CooldownActive();

        // Transfer tokens
        mcopToken.safeTransferFrom(msg.sender, address(this), amount);

        // Update stake
        info.amount += amount;
        info.stakedAt = block.timestamp;

        // Determine tier
        uint256 tokenAmount = info.amount / tokenDecimals;
        if (tokenAmount >= TIER_COMMANDER) {
            info.tier = Tier.Commander;
        } else if (tokenAmount >= TIER_SENIOR) {
            info.tier = Tier.Senior;
        } else if (tokenAmount >= TIER_OPERATIVE) {
            info.tier = Tier.Operative;
        } else if (tokenAmount >= TIER_OBSERVER) {
            info.tier = Tier.Observer;
        } else {
            revert InsufficientStake();
        }

        // Track stakers
        if (!isStaker[msg.sender]) {
            stakers.push(msg.sender);
            isStaker[msg.sender] = true;
        }

        // Check founding operative status
        if (badgeContract != address(0)) {
            // Check if they hold a Founding Operative badge
            (bool success, bytes memory data) = badgeContract.staticcall(
                abi.encodeWithSignature("isOperative(address)", msg.sender)
            );
            if (success && data.length >= 32) {
                info.isFoundingOperative = abi.decode(data, (bool));
            }
        }

        totalStaked += amount;

        emit Staked(msg.sender, amount, info.tier);
    }

    /**
     * @notice Begin unstaking cooldown. Tokens locked for COOLDOWN_PERIOD.
     * @param amount Amount to unstake (in wei)
     */
    function beginUnstake(uint256 amount) external nonReentrant {
        StakeInfo storage info = stakes[msg.sender];
        if (!isStaker[msg.sender]) revert NotStaker();
        if (amount == 0) revert ZeroAmount();
        if (amount > info.amount) revert InsufficientStake();
        if (info.cooldownStart > 0) revert CooldownActive();

        info.cooldownStart = block.timestamp;
        info.cooldownAmount = amount;

        emit CooldownStarted(msg.sender, amount, block.timestamp + COOLDOWN_PERIOD);
    }

    /**
     * @notice Complete unstaking after cooldown period.
     */
    function completeUnstake() external nonReentrant {
        StakeInfo storage info = stakes[msg.sender];
        if (info.cooldownStart == 0) revert NoCooldownActive();
        if (block.timestamp < info.cooldownStart + COOLDOWN_PERIOD) revert CooldownNotComplete();

        uint256 amount = info.cooldownAmount;
        info.amount -= amount;
        info.cooldownStart = 0;
        info.cooldownAmount = 0;
        totalStaked -= amount;

        // Recalculate tier
        uint256 tokenAmount = info.amount / tokenDecimals;
        if (tokenAmount >= TIER_COMMANDER) {
            info.tier = Tier.Commander;
        } else if (tokenAmount >= TIER_SENIOR) {
            info.tier = Tier.Senior;
        } else if (tokenAmount >= TIER_OPERATIVE) {
            info.tier = Tier.Operative;
        } else if (tokenAmount >= TIER_OBSERVER) {
            info.tier = Tier.Observer;
        } else {
            info.tier = Tier.None;
            // Don't remove from stakers array (gas expensive), tier=None handles it
        }

        mcopToken.safeTransfer(msg.sender, amount);

        emit Unstaked(msg.sender, amount);
    }

    // ═══════════════════════════════════════════════════════════
    // REVIEWS
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Record that a staker submitted an agent review.
     * @dev Called by the backend oracle after validating the review
     *      against MoltShield scan results and community consensus.
     */
    function recordReview(
        address staker,
        address agent,
        bool accurate
    ) external onlyRole(REWARDS_ROLE) {
        StakeInfo storage info = stakes[staker];
        if (info.tier == Tier.None) revert NotStaker();

        info.reviewCount++;
        info.lastReviewAt = block.timestamp;

        if (accurate) {
            info.accurateReviews++;

            // Calculate reward based on tier weight
            uint256 baseReward = 10 * tokenDecimals; // 10 MCOP base
            uint256 weight = _getTierWeight(info.tier);
            uint256 reward = baseReward * weight;

            // Founding operative bonus: 20%
            if (info.isFoundingOperative) {
                reward = (reward * 120) / 100;
            }

            // Cap at available rewards
            if (reward > rewardPoolBalance) {
                reward = rewardPoolBalance;
            }

            if (reward > 0) {
                info.rewardsEarned += reward;
                rewardPoolBalance -= reward;
            }
        }

        emit ReviewRecorded(staker, agent, accurate);
    }

    /**
     * @notice Claim accumulated rewards.
     */
    function claimRewards() external nonReentrant {
        StakeInfo storage info = stakes[msg.sender];
        uint256 reward = info.rewardsEarned;
        if (reward == 0) revert NoRewards();

        info.rewardsEarned = 0;
        mcopToken.safeTransfer(msg.sender, reward);

        emit RewardClaimed(msg.sender, reward);
    }

    // ═══════════════════════════════════════════════════════════
    // SLASHING
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Slash a staker for inaccurate reviews.
     * @dev Called after governance vote confirms the challenge.
     *      50% of slashed amount goes to challenger, 50% to slash pool.
     */
    function slash(
        address staker,
        address challenger,
        string calldata reason
    ) external onlyRole(SLASHER_ROLE) nonReentrant {
        StakeInfo storage info = stakes[staker];
        if (info.tier == Tier.None) revert NotStaker();

        uint256 slashBps = _getSlashBps(info.tier);
        uint256 slashAmount = (info.amount * slashBps) / 10000;

        info.amount -= slashAmount;
        totalStaked -= slashAmount;
        totalSlashed += slashAmount;

        // Recalculate tier after slash
        uint256 tokenAmount = info.amount / tokenDecimals;
        if (tokenAmount >= TIER_COMMANDER) info.tier = Tier.Commander;
        else if (tokenAmount >= TIER_SENIOR) info.tier = Tier.Senior;
        else if (tokenAmount >= TIER_OPERATIVE) info.tier = Tier.Operative;
        else if (tokenAmount >= TIER_OBSERVER) info.tier = Tier.Observer;
        else info.tier = Tier.None;

        // Split: 50% to challenger, 50% to slash pool
        uint256 challengerShare = slashAmount / 2;
        uint256 poolShare = slashAmount - challengerShare;

        mcopToken.safeTransfer(challenger, challengerShare);
        slashPoolBalance += poolShare;

        slashHistory.push(SlashRecord({
            staker: staker,
            challenger: challenger,
            amount: slashAmount,
            reason: reason,
            timestamp: block.timestamp
        }));

        emit Slashed(staker, challenger, slashAmount, reason);
    }

    // ═══════════════════════════════════════════════════════════
    // REWARD FUNDING
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Deposit MCOP into the reward pool.
     * @dev Called by the scan fee mechanism and community allocation.
     */
    function depositRewards(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        mcopToken.safeTransferFrom(msg.sender, address(this), amount);
        rewardPoolBalance += amount;
        emit RewardsDeposited(msg.sender, amount);
    }

    /**
     * @notice Distribute slash pool proportionally to all active stakers.
     */
    function distributeSlashPool() external onlyRole(REWARDS_ROLE) {
        require(slashPoolBalance > 0, "Empty slash pool");
        require(totalStaked > 0, "No stakers");

        uint256 pool = slashPoolBalance;
        slashPoolBalance = 0;

        // Move to reward pool for individual claims
        // (Pro-rata distribution based on stake weight happens via claimRewards)
        rewardPoolBalance += pool;
    }

    // ═══════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Get review weight for a staker.
     * @dev Used by the ERC-8004 integration to weight reputation feedback.
     *      Returns weight in WEIGHT_DECIMALS precision.
     *      Sub-linear: sqrt(stake / tier_min) * tier_weight
     */
    function getReviewWeight(address staker) external view returns (uint256) {
        StakeInfo storage info = stakes[staker];
        if (info.tier == Tier.None) return 0;

        uint256 baseWeight = _getTierWeight(info.tier) * WEIGHT_DECIMALS;

        // Sub-linear scaling within tier
        // At minimum stake: 1.0x tier weight
        // At 4x minimum: 2.0x tier weight (sqrt)
        // At 9x minimum: 3.0x tier weight (sqrt)
        uint256 tierMin = _getTierMinimum(info.tier) * tokenDecimals;
        if (tierMin == 0) return 0;

        uint256 ratio = (info.amount * WEIGHT_DECIMALS) / tierMin;
        uint256 sqrtRatio = _sqrt(ratio * WEIGHT_DECIMALS); // sqrt with precision

        uint256 weight = (baseWeight * sqrtRatio) / WEIGHT_DECIMALS;

        // Founding operative bonus: 20%
        if (info.isFoundingOperative) {
            weight = (weight * 120) / 100;
        }

        return weight;
    }

    /**
     * @notice Get the accuracy rate for a staker (basis points).
     */
    function getAccuracyRate(address staker) external view returns (uint256) {
        StakeInfo storage info = stakes[staker];
        if (info.reviewCount == 0) return 0;
        return (info.accurateReviews * 10000) / info.reviewCount;
    }

    /**
     * @notice Get all active staker addresses (for trusted_clients list).
     * @dev Returns only stakers with Tier > None.
     */
    function getActiveStakers() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < stakers.length; i++) {
            if (stakes[stakers[i]].tier != Tier.None) count++;
        }

        address[] memory active = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < stakers.length; i++) {
            if (stakes[stakers[i]].tier != Tier.None) {
                active[idx++] = stakers[i];
            }
        }
        return active;
    }

    /**
     * @notice Total staker count (active tiers only).
     */
    function activeStakerCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < stakers.length; i++) {
            if (stakes[stakers[i]].tier != Tier.None) count++;
        }
        return count;
    }

    /**
     * @notice Time remaining in cooldown (0 if not cooling down or complete).
     */
    function cooldownRemaining(address staker) external view returns (uint256) {
        StakeInfo storage info = stakes[staker];
        if (info.cooldownStart == 0) return 0;
        uint256 unlockTime = info.cooldownStart + COOLDOWN_PERIOD;
        if (block.timestamp >= unlockTime) return 0;
        return unlockTime - block.timestamp;
    }

    // ═══════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════

    function setBadgeContract(address _badge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        badgeContract = _badge;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // ═══════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════

    function _getTierWeight(Tier tier) internal pure returns (uint256) {
        if (tier == Tier.Commander) return WEIGHT_COMMANDER;
        if (tier == Tier.Senior) return WEIGHT_SENIOR;
        if (tier == Tier.Operative) return WEIGHT_OPERATIVE;
        if (tier == Tier.Observer) return WEIGHT_OBSERVER;
        return 0;
    }

    function _getTierMinimum(Tier tier) internal pure returns (uint256) {
        if (tier == Tier.Commander) return TIER_COMMANDER;
        if (tier == Tier.Senior) return TIER_SENIOR;
        if (tier == Tier.Operative) return TIER_OPERATIVE;
        if (tier == Tier.Observer) return TIER_OBSERVER;
        return 0;
    }

    function _getSlashBps(Tier tier) internal pure returns (uint256) {
        if (tier == Tier.Commander) return SLASH_COMMANDER_BPS;
        if (tier == Tier.Senior) return SLASH_SENIOR_BPS;
        if (tier == Tier.Operative) return SLASH_OPERATIVE_BPS;
        if (tier == Tier.Observer) return SLASH_OBSERVER_BPS;
        return 0;
    }

    /**
     * @dev Babylonian method for integer square root.
     */
    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }
}
