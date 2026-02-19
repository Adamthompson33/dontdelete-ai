// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
 ╔══════════════════════════════════════════════════════════════╗
 ║                                                              ║
 ║   🔒  $MCOP TOKEN VESTING                                   ║
 ║                                                              ║
 ║   On-chain. Immutable. No manual unlocks.                   ║
 ║   "Earn trust through action. Not promises. Results."       ║
 ║                                                              ║
 ╚══════════════════════════════════════════════════════════════╝
 
 Configurations:
   Team:       36-month vest, 12-month cliff, linear monthly
   Operatives: 18-month vest, 3-month cliff, linear monthly
   Treasury:   48-month vest, no cliff, 2% monthly (governance-gated)
*/

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MCOPVesting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Types ──
    struct VestingSchedule {
        address beneficiary;       // Who receives the tokens
        uint256 totalAmount;       // Total tokens allocated
        uint256 released;          // Tokens already released
        uint256 startTime;         // When vesting begins
        uint256 cliffDuration;     // Cliff period (seconds)
        uint256 vestingDuration;   // Total vesting period (seconds)
        bool revocable;            // Can the owner revoke unvested tokens?
        bool revoked;              // Has it been revoked?
        string label;              // "team", "operative", "treasury"
    }

    // ── State ──
    IERC20 public immutable mcopToken;
    uint256 public immutable startTimestamp; // TGE timestamp

    VestingSchedule[] public schedules;
    mapping(address => uint256[]) public beneficiarySchedules; // beneficiary => schedule indices

    uint256 public totalAllocated;
    uint256 public totalReleased;

    // ── Events ──
    event ScheduleCreated(
        uint256 indexed scheduleId,
        address indexed beneficiary,
        uint256 amount,
        uint256 cliffDuration,
        uint256 vestingDuration,
        string label
    );
    event TokensReleased(uint256 indexed scheduleId, address indexed beneficiary, uint256 amount);
    event ScheduleRevoked(uint256 indexed scheduleId, uint256 unvestedReturned);

    // ── Errors ──
    error NothingToRelease();
    error ScheduleRevoked_();
    error NotRevocable();
    error InvalidSchedule();
    error InvalidBeneficiary();

    constructor(
        address _mcopToken,
        address _admin
    ) Ownable(_admin) {
        mcopToken = IERC20(_mcopToken);
        startTimestamp = block.timestamp;
    }

    // ═══════════════════════════════════════════════════════════
    // SCHEDULE MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Create a vesting schedule.
     * @dev Tokens must already be in this contract before creating schedules.
     */
    function createSchedule(
        address beneficiary,
        uint256 amount,
        uint256 cliffDuration,
        uint256 vestingDuration,
        bool revocable,
        string calldata label
    ) external onlyOwner {
        if (beneficiary == address(0)) revert InvalidBeneficiary();
        if (amount == 0 || vestingDuration == 0) revert InvalidSchedule();
        if (cliffDuration > vestingDuration) revert InvalidSchedule();

        uint256 scheduleId = schedules.length;

        schedules.push(VestingSchedule({
            beneficiary: beneficiary,
            totalAmount: amount,
            released: 0,
            startTime: block.timestamp,
            cliffDuration: cliffDuration,
            vestingDuration: vestingDuration,
            revocable: revocable,
            revoked: false,
            label: label
        }));

        beneficiarySchedules[beneficiary].push(scheduleId);
        totalAllocated += amount;

        emit ScheduleCreated(scheduleId, beneficiary, amount, cliffDuration, vestingDuration, label);
    }

    /**
     * @notice Batch create schedules for multiple beneficiaries.
     * @dev Used for Founding Operative allocation (100 addresses).
     */
    function createBatchSchedules(
        address[] calldata beneficiaries,
        uint256[] calldata amounts,
        uint256 cliffDuration,
        uint256 vestingDuration,
        bool revocable,
        string calldata label
    ) external onlyOwner {
        require(beneficiaries.length == amounts.length, "Length mismatch");

        for (uint256 i = 0; i < beneficiaries.length; i++) {
            if (beneficiaries[i] == address(0)) revert InvalidBeneficiary();
            if (amounts[i] == 0) revert InvalidSchedule();

            uint256 scheduleId = schedules.length;

            schedules.push(VestingSchedule({
                beneficiary: beneficiaries[i],
                totalAmount: amounts[i],
                released: 0,
                startTime: block.timestamp,
                cliffDuration: cliffDuration,
                vestingDuration: vestingDuration,
                revocable: revocable,
                revoked: false,
                label: label
            }));

            beneficiarySchedules[beneficiaries[i]].push(scheduleId);
            totalAllocated += amounts[i];

            emit ScheduleCreated(
                scheduleId, beneficiaries[i], amounts[i],
                cliffDuration, vestingDuration, label
            );
        }
    }

    // ═══════════════════════════════════════════════════════════
    // CLAIMING
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Release vested tokens for a specific schedule.
     */
    function release(uint256 scheduleId) external nonReentrant {
        VestingSchedule storage s = schedules[scheduleId];
        if (s.revoked) revert ScheduleRevoked_();

        uint256 releasable = _vestedAmount(s) - s.released;
        if (releasable == 0) revert NothingToRelease();

        s.released += releasable;
        totalReleased += releasable;

        mcopToken.safeTransfer(s.beneficiary, releasable);

        emit TokensReleased(scheduleId, s.beneficiary, releasable);
    }

    /**
     * @notice Release all vested tokens across all schedules for caller.
     */
    function releaseAll() external nonReentrant {
        uint256[] storage ids = beneficiarySchedules[msg.sender];
        uint256 totalReleasable = 0;

        for (uint256 i = 0; i < ids.length; i++) {
            VestingSchedule storage s = schedules[ids[i]];
            if (s.revoked) continue;

            uint256 releasable = _vestedAmount(s) - s.released;
            if (releasable > 0) {
                s.released += releasable;
                totalReleasable += releasable;
                emit TokensReleased(ids[i], msg.sender, releasable);
            }
        }

        if (totalReleasable == 0) revert NothingToRelease();

        totalReleased += totalReleasable;
        mcopToken.safeTransfer(msg.sender, totalReleasable);
    }

    // ═══════════════════════════════════════════════════════════
    // REVOCATION
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Revoke a vesting schedule. Releases vested tokens to beneficiary,
     *         returns unvested to the owner (treasury).
     * @dev Only works for revocable schedules (team, not operatives).
     */
    function revoke(uint256 scheduleId) external onlyOwner nonReentrant {
        VestingSchedule storage s = schedules[scheduleId];
        if (!s.revocable) revert NotRevocable();
        if (s.revoked) revert ScheduleRevoked_();

        // Release any vested tokens
        uint256 vested = _vestedAmount(s);
        uint256 unreleased = vested - s.released;
        uint256 unvested = s.totalAmount - vested;

        s.revoked = true;

        if (unreleased > 0) {
            s.released += unreleased;
            totalReleased += unreleased;
            mcopToken.safeTransfer(s.beneficiary, unreleased);
        }

        if (unvested > 0) {
            totalAllocated -= unvested;
            mcopToken.safeTransfer(owner(), unvested);
        }

        emit ScheduleRevoked(scheduleId, unvested);
    }

    // ═══════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Amount currently releasable for a schedule.
     */
    function releasableAmount(uint256 scheduleId) external view returns (uint256) {
        VestingSchedule storage s = schedules[scheduleId];
        if (s.revoked) return 0;
        return _vestedAmount(s) - s.released;
    }

    /**
     * @notice Total releasable across all schedules for an address.
     */
    function totalReleasableFor(address beneficiary) external view returns (uint256) {
        uint256[] storage ids = beneficiarySchedules[beneficiary];
        uint256 total = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            VestingSchedule storage s = schedules[ids[i]];
            if (!s.revoked) {
                total += _vestedAmount(s) - s.released;
            }
        }
        return total;
    }

    /**
     * @notice Get all schedule IDs for a beneficiary.
     */
    function getScheduleIds(address beneficiary) external view returns (uint256[] memory) {
        return beneficiarySchedules[beneficiary];
    }

    /**
     * @notice Total number of vesting schedules.
     */
    function scheduleCount() external view returns (uint256) {
        return schedules.length;
    }

    /**
     * @notice Locked tokens = allocated - released (for circulating supply calculation).
     */
    function totalLocked() external view returns (uint256) {
        return totalAllocated - totalReleased;
    }

    /**
     * @notice Vesting progress for a schedule (basis points).
     */
    function vestingProgress(uint256 scheduleId) external view returns (uint256) {
        VestingSchedule storage s = schedules[scheduleId];
        if (s.totalAmount == 0) return 0;
        return (_vestedAmount(s) * 10000) / s.totalAmount;
    }

    // ═══════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════

    /**
     * @dev Calculate vested amount for a schedule using linear vesting with cliff.
     */
    function _vestedAmount(VestingSchedule storage s) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - s.startTime;

        // Before cliff: nothing vested
        if (elapsed < s.cliffDuration) {
            return 0;
        }

        // After full vesting: everything vested
        if (elapsed >= s.vestingDuration) {
            return s.totalAmount;
        }

        // Linear vesting
        return (s.totalAmount * elapsed) / s.vestingDuration;
    }
}
