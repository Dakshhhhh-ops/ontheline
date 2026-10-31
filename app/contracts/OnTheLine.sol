// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title OnTheLine
/// @notice Locks USDC against goals resolved by a designated referee or expiration.
/// @dev Amounts are in token base units (six decimals for USDC). Intended for ordinary,
/// non-rebasing USDC. Creation rejects transfers that do not deliver the exact amount.
/// Unsolicited token transfers are not pledges and do not increase totalLocked; ERC-20
/// transfers made directly to this contract cannot be prevented or recovered.
/// @dev Trust assumptions: USDC issuer blocklisting of this contract's address freezes
/// all pledges. A forfeit recipient or staker that cannot receive USDC (for example,
/// because it is blocklisted) causes the corresponding payout to revert and leaves
/// the pledge unresolved. Stakers must choose recipients able to receive USDC.
contract OnTheLine is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The possible states of a pledge; resolved states are terminal.
    enum Status { Active, Kept, Forfeited }

    /// @notice A commitment and its resolution terms.
    /// @param staker Account that funded the pledge and receives a kept refund.
    /// @param referee Account authorized to confirm or fail the pledge.
    /// @param forfeitTo Account receiving forfeited funds.
    /// @param amount Locked token base units.
    /// @param deadline Goal deadline, in Unix seconds.
    /// @param reviewEnd Last Unix second in which confirmation is permitted.
    /// @param status Current resolution state.
    /// @param goal Goal description, containing 1 through 280 bytes.
    struct Pledge {
        address staker;
        address referee;
        address forfeitTo;
        uint128 amount;
        uint64 deadline;
        uint64 reviewEnd;
        Status status;
        string goal;
    }

    /// @notice Maximum number of identifiers returned by a paginated getter.
    uint256 public constant MAX_PAGE = 100;

    /// @notice Token used for all pledges.
    IERC20 public immutable token;
    /// @notice Alias for token, intended to be the six-decimal USDC token.
    IERC20 public immutable usdc;
    /// @notice Sum of amounts of all Active pledges, in token base units.
    uint256 public totalLocked;
    /// @notice Cumulative amount refunded for Kept pledges, in token base units.
    uint256 public totalKept;
    /// @notice Cumulative amount paid for Forfeited pledges, in token base units.
    uint256 public totalForfeited;

    Pledge[] private _pledges;
    mapping(address => uint256[]) private _byStaker;
    mapping(address => uint256[]) private _byReferee;
    mapping(address => uint256[]) private _byRecipient;

    /// @notice A zero token address is invalid.
    error InvalidToken();
    /// @notice The requested pledge does not exist.
    error NonexistentPledge(uint256 id);
    /// @notice A pledge must lock a nonzero amount.
    error InvalidAmount();
    /// @notice The deadline must be strictly in the future.
    error InvalidDeadline();
    /// @notice The referee must be nonzero and different from the staker.
    error InvalidReferee();
    /// @notice The recipient must be nonzero and different from the staker.
    error InvalidRecipient();
    /// @notice The goal must contain between 1 and 280 bytes.
    error InvalidGoalLength();
    /// @notice The review window cannot exceed 30 days.
    error InvalidReviewWindow();
    /// @notice The calculated review end cannot fit in uint64.
    error ReviewEndOverflow();
    /// @notice Only the designated referee may perform this action.
    error NotReferee(uint256 id, address caller);
    /// @notice Only Active pledges may be resolved.
    error PledgeNotActive(uint256 id);
    /// @notice The confirmation window has closed.
    error ReviewEnded(uint256 id, uint64 reviewEnd);
    /// @notice Public expiration settlement requires time strictly after reviewEnd.
    error NotExpired(uint256 id, uint64 reviewEnd);
    /// @notice A token transfer did not increase custody by exactly the pledged amount.
    error UnexpectedTokenBalanceDelta(uint256 expected, uint256 actual);

    /// @notice Emitted when a funded pledge is created.
    /// @param id Zero-based pledge identifier.
    /// @param staker Funding account.
    /// @param referee Designated resolver.
    /// @param forfeitTo Forfeit recipient.
    /// @param amount Locked token base units.
    /// @param deadline Goal deadline in Unix seconds.
    /// @param reviewEnd Inclusive confirmation cutoff in Unix seconds.
    /// @param goal Goal description.
    event PledgeCreated(
        uint256 indexed id,
        address indexed staker,
        address indexed referee,
        address forfeitTo,
        uint128 amount,
        uint64 deadline,
        uint64 reviewEnd,
        string goal
    );

    /// @notice Emitted when the referee confirms a pledge and refunds its staker.
    /// @param id Pledge identifier.
    /// @param staker Refund recipient.
    /// @param amount Refunded token base units.
    event PledgeKept(uint256 indexed id, address indexed staker, uint128 amount);

    /// @notice Emitted when a pledge is forfeited.
    /// @param id Pledge identifier.
    /// @param forfeitTo Payment recipient.
    /// @param amount Forfeited token base units.
    /// @param expired True for public expiration settlement; false for referee failure.
    event PledgeForfeited(uint256 indexed id, address indexed forfeitTo, uint128 amount, bool expired);

    /// @notice Configures the immutable pledge token without installing any administrator.
    /// @param tokenAddress USDC address; on Arc testnet and mainnet this is
    /// 0x3600000000000000000000000000000000000000.
    constructor(address tokenAddress) {
        if (tokenAddress == address(0)) revert InvalidToken();
        token = IERC20(tokenAddress);
        usdc = IERC20(tokenAddress);
    }

    /// @notice Creates and funds a pledge using the caller's token allowance.
    /// @dev State is recorded before transferFrom; an incorrect received amount reverts
    /// the entire transaction, including all state changes and the token transfer.
    /// @param goal Description containing 1 through 280 bytes.
    /// @param referee Nonzero resolver distinct from the caller.
    /// @param forfeitTo Nonzero forfeit recipient distinct from the caller.
    /// @param amount Token base units to lock, strictly positive.
    /// @param deadline Future goal deadline in Unix seconds.
    /// @param reviewWindow Additional confirmation time, at most 30 days; may be zero.
    /// @return id Zero-based identifier; pledgeCount is the next available identifier.
    function create(
        string calldata goal,
        address referee,
        address forfeitTo,
        uint128 amount,
        uint64 deadline,
        uint64 reviewWindow
    ) external nonReentrant returns (uint256 id) {
        if (amount == 0) revert InvalidAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (referee == address(0) || referee == msg.sender || referee == address(this) || referee == address(token)) revert InvalidReferee();
        if (forfeitTo == address(0) || forfeitTo == msg.sender || forfeitTo == address(this) || forfeitTo == address(token)) revert InvalidRecipient();
        if (bytes(goal).length == 0 || bytes(goal).length > 280) revert InvalidGoalLength();
        if (reviewWindow > 30 days) revert InvalidReviewWindow();
        Pledge memory p = Pledge({
            staker: msg.sender,
            referee: referee,
            forfeitTo: forfeitTo,
            amount: amount,
            deadline: deadline,
            reviewEnd: _reviewEnd(deadline, reviewWindow),
            status: Status.Active,
            goal: goal
        });

        id = _pledges.length;
        _pledges.push(p);
        _byStaker[msg.sender].push(id);
        _byReferee[referee].push(id);
        _byRecipient[forfeitTo].push(id);
        totalLocked += amount;

        _pull(amount);
        emit PledgeCreated(id, p.staker, p.referee, p.forfeitTo, p.amount, p.deadline, p.reviewEnd, p.goal);
    }

    /// @notice Confirms success and refunds the staker, including at exactly reviewEnd.
    /// @dev Only the referee may call; confirmation before the deadline is permitted.
    /// @param id Identifier of an Active pledge.
    function confirm(uint256 id) external nonReentrant {
        Pledge storage pledge = _getPledge(id);
        if (msg.sender != pledge.referee) revert NotReferee(id, msg.sender);
        if (pledge.status != Status.Active) revert PledgeNotActive(id);
        if (block.timestamp > pledge.reviewEnd) revert ReviewEnded(id, pledge.reviewEnd);
        pledge.status = Status.Kept;
        totalLocked -= pledge.amount;
        totalKept += pledge.amount;
        emit PledgeKept(id, pledge.staker, pledge.amount);
        token.safeTransfer(pledge.staker, pledge.amount);
    }

    /// @notice Forfeits an Active pledge, at any time, on the referee's decision.
    /// @param id Identifier of an Active pledge.
    function fail(uint256 id) external nonReentrant {
        Pledge storage pledge = _getPledge(id);
        if (msg.sender != pledge.referee) revert NotReferee(id, msg.sender);
        if (pledge.status != Status.Active) revert PledgeNotActive(id);
        _forfeit(id, pledge, false);
    }

    /// @notice Forfeits an unanswered pledge strictly after its review window ends.
    /// @dev Anyone may call; there is no keeper reward or fee.
    /// @param id Identifier of an Active pledge.
    function settleExpired(uint256 id) external nonReentrant {
        Pledge storage pledge = _getPledge(id);
        if (pledge.status != Status.Active) revert PledgeNotActive(id);
        if (block.timestamp <= pledge.reviewEnd) revert NotExpired(id, pledge.reviewEnd);
        _forfeit(id, pledge, true);
    }

    /// @notice Returns all stored fields for an existing pledge.
    /// @param id Pledge identifier.
    /// @return pledge Complete pledge record, including its goal.
    function getPledge(uint256 id) external view returns (Pledge memory pledge) {
        return _getPledge(id);
    }

    /// @notice Returns the number of pledges and the next identifier to be assigned.
    /// @return count Total number created, including resolved pledges.
    function pledgeCount() external view returns (uint256 count) {
        return _pledges.length;
    }

    /// @notice Lists all pledge identifiers funded by an account, in creation order.
    /// @dev Unbounded full-history view; clients should prefer pledgesByStakerPage.
    /// @param staker Funding account.
    /// @return ids Identifiers, including resolved pledges.
    function pledgesByStaker(address staker) external view returns (uint256[] memory ids) {
        return _byStaker[staker];
    }

    /// @notice Lists all pledge identifiers assigned to a referee, in creation order.
    /// @dev Unbounded full-history view; clients should prefer pledgesByRefereePage.
    /// @param referee Resolver account.
    /// @return ids Identifiers, including resolved pledges.
    function pledgesByReferee(address referee) external view returns (uint256[] memory ids) {
        return _byReferee[referee];
    }

    /// @notice Lists all pledge identifiers naming a recipient, in creation order.
    /// @dev Unbounded full-history view; clients should prefer pledgesByRecipientPage.
    /// @param recipient Forfeit recipient account.
    /// @return ids Identifiers, including resolved pledges.
    function pledgesByRecipient(address recipient) external view returns (uint256[] memory ids) {
        return _byRecipient[recipient];
    }

    /// @notice Returns the number of pledges funded by an account, including resolved pledges.
    function stakerPledgeCount(address who) external view returns (uint256) {
        return _byStaker[who].length;
    }

    /// @notice Returns the number of pledges assigned to a referee, including resolved pledges.
    function refereePledgeCount(address who) external view returns (uint256) {
        return _byReferee[who].length;
    }

    /// @notice Returns the number of pledges naming a recipient, including resolved pledges.
    function recipientPledgeCount(address who) external view returns (uint256) {
        return _byRecipient[who].length;
    }

    /// @notice Lists a page of pledge identifiers funded by an account, in creation order.
    /// @dev Clamps limit to MAX_PAGE; an offset at or beyond the count returns an empty array.
    function pledgesByStakerPage(address who, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _page(_byStaker[who], offset, limit);
    }

    /// @notice Lists a page of pledge identifiers assigned to a referee, in creation order.
    /// @dev Clamps limit to MAX_PAGE; an offset at or beyond the count returns an empty array.
    function pledgesByRefereePage(address who, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _page(_byReferee[who], offset, limit);
    }

    /// @notice Lists a page of pledge identifiers naming a recipient, in creation order.
    /// @dev Clamps limit to MAX_PAGE; an offset at or beyond the count returns an empty array.
    function pledgesByRecipientPage(address who, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _page(_byRecipient[who], offset, limit);
    }

    /// @dev Copies at most MAX_PAGE identifiers without adding offset to an unbounded limit.
    function _page(uint256[] storage source, uint256 offset, uint256 limit) private view returns (uint256[] memory ids) {
        uint256 length = source.length;
        if (offset >= length) return new uint256[](0);
        if (limit > MAX_PAGE) limit = MAX_PAGE;
        uint256 remaining = length - offset;
        if (limit > remaining) limit = remaining;
        ids = new uint256[](limit);
        for (uint256 i = 0; i < limit; ++i) {
            ids[i] = source[offset + i];
        }
    }

    /// @dev Resolves a known Active pledge before making the token payment.
    /// @param id Pledge identifier.
    /// @param pledge Validated Active storage record.
    /// @param expired Whether resolution was triggered by public expiration.
    function _forfeit(uint256 id, Pledge storage pledge, bool expired) private {
        pledge.status = Status.Forfeited;
        totalLocked -= pledge.amount;
        totalForfeited += pledge.amount;
        emit PledgeForfeited(id, pledge.forfeitTo, pledge.amount, expired);
        token.safeTransfer(pledge.forfeitTo, pledge.amount);
    }

    /// @dev Computes deadline + reviewWindow, reverting if it cannot fit in uint64.
    function _reviewEnd(uint64 deadline, uint64 reviewWindow) private pure returns (uint64) {
        uint256 end = uint256(deadline) + uint256(reviewWindow);
        if (end > type(uint64).max) revert ReviewEndOverflow();
        return uint64(end);
    }

    /// @dev Pulls exactly `amount` tokens from the caller, reverting on any other balance delta.
    function _pull(uint256 amount) private {
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 afterBalance = token.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) {
            // A balance decrease has no nonnegative received amount; report zero.
            revert UnexpectedTokenBalanceDelta(amount, afterBalance < beforeBalance ? 0 : afterBalance - beforeBalance);
        }
    }

    /// @dev Looks up a pledge with a custom error instead of an array bounds panic.
    /// @param id Pledge identifier.
    /// @return pledge Reference to the existing storage record.
    function _getPledge(uint256 id) private view returns (Pledge storage pledge) {
        if (id >= _pledges.length) revert NonexistentPledge(id);
        return _pledges[id];
    }
}
