// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {OnTheLine} from "../OnTheLine.sol";
import {OnTheLineTestBase} from "./OnTheLine.Base.t.sol";
import {FeeOnTransferToken} from "./mocks/Mocks.sol";

/// @dev create(): happy path, every validation revert, and token-transfer failure modes.
contract OnTheLineCreateTest is OnTheLineTestBase {
    function _bytesOfLen(uint256 n) internal pure returns (string memory) {
        return string(new bytes(n));
    }

    function _createWith(
        string memory goal,
        address ref,
        address to,
        uint128 amount,
        uint64 dl,
        uint64 window
    ) internal returns (uint256) {
        vm.prank(staker);
        return ol.create(goal, ref, to, amount, dl, window);
    }

    // ---------------------------------------------------------------- happy path
    function test_Create_EmitsEventPullsFundsAndReturnsSequentialIds() public {
        uint256 stakerBefore = usdc.balanceOf(staker);
        vm.expectEmit(true, true, true, true, address(ol));
        emit OnTheLine.PledgeCreated(0, staker, referee, recipient, AMT, deadline, _reviewEnd(), GOAL);
        uint256 id0 = _create();
        assertEq(id0, 0);
        assertEq(_create(), 1);

        assertEq(usdc.balanceOf(staker), stakerBefore - 2 * uint256(AMT));
        assertEq(usdc.balanceOf(address(ol)), 2 * uint256(AMT));
        assertEq(ol.totalLocked(), 2 * uint256(AMT));
        assertEq(ol.pledgeCount(), 2);
    }

    // ---------------------------------------------------------------- validation reverts
    function test_Create_AmountZeroReverts() public {
        vm.expectRevert(OnTheLine.InvalidAmount.selector);
        _createWith(GOAL, referee, recipient, 0, deadline, WINDOW);
    }

    function test_Create_DeadlineNotInFutureReverts() public {
        vm.expectRevert(OnTheLine.InvalidDeadline.selector);
        _createWith(GOAL, referee, recipient, AMT, uint64(block.timestamp), WINDOW); // == now
        vm.expectRevert(OnTheLine.InvalidDeadline.selector);
        _createWith(GOAL, referee, recipient, AMT, uint64(block.timestamp - 1), WINDOW); // past
        vm.expectRevert(OnTheLine.InvalidDeadline.selector);
        _createWith(GOAL, referee, recipient, AMT, 0, WINDOW);
        // now + 1 is accepted
        _createWith(GOAL, referee, recipient, AMT, uint64(block.timestamp + 1), WINDOW);
    }

    function test_Create_RefereeInvalidReverts() public {
        vm.expectRevert(OnTheLine.InvalidReferee.selector);
        _createWith(GOAL, staker, recipient, AMT, deadline, WINDOW);
        vm.expectRevert(OnTheLine.InvalidReferee.selector);
        _createWith(GOAL, address(0), recipient, AMT, deadline, WINDOW);
        vm.expectRevert(OnTheLine.InvalidReferee.selector);
        _createWith(GOAL, address(ol), recipient, AMT, deadline, WINDOW);
        vm.expectRevert(OnTheLine.InvalidReferee.selector);
        _createWith(GOAL, address(usdc), recipient, AMT, deadline, WINDOW);
    }

    function test_Create_RecipientInvalidReverts() public {
        vm.expectRevert(OnTheLine.InvalidRecipient.selector);
        _createWith(GOAL, referee, staker, AMT, deadline, WINDOW);
        vm.expectRevert(OnTheLine.InvalidRecipient.selector);
        _createWith(GOAL, referee, address(0), AMT, deadline, WINDOW);
        vm.expectRevert(OnTheLine.InvalidRecipient.selector);
        _createWith(GOAL, referee, address(ol), AMT, deadline, WINDOW);
        vm.expectRevert(OnTheLine.InvalidRecipient.selector);
        _createWith(GOAL, referee, address(usdc), AMT, deadline, WINDOW);
    }

    function test_Create_RefereeMayEqualRecipient() public {
        uint256 id = _createWith(GOAL, referee, referee, AMT, deadline, WINDOW);
        assertEq(ol.getPledge(id).forfeitTo, referee);
    }

    function test_Create_GoalLengthBounds() public {
        vm.expectRevert(OnTheLine.InvalidGoalLength.selector);
        _createWith("", referee, recipient, AMT, deadline, WINDOW);
        vm.expectRevert(OnTheLine.InvalidGoalLength.selector);
        _createWith(_bytesOfLen(281), referee, recipient, AMT, deadline, WINDOW);

        uint256 id = _createWith(_bytesOfLen(280), referee, recipient, AMT, deadline, WINDOW);
        assertEq(bytes(ol.getPledge(id).goal).length, 280);
        uint256 id1 = _createWith(_bytesOfLen(1), referee, recipient, AMT, deadline, WINDOW);
        assertEq(bytes(ol.getPledge(id1).goal).length, 1);
    }

    function test_Create_ReviewWindowBounds() public {
        vm.expectRevert(OnTheLine.InvalidReviewWindow.selector);
        _createWith(GOAL, referee, recipient, AMT, deadline, 30 days + 1);
        uint256 id = _createWith(GOAL, referee, recipient, AMT, deadline, 30 days);
        assertEq(ol.getPledge(id).reviewEnd, deadline + 30 days);
    }

    function test_Create_ReviewEndOverflowReverts() public {
        uint64 maxU = type(uint64).max;
        vm.expectRevert(OnTheLine.ReviewEndOverflow.selector);
        _createWith(GOAL, referee, recipient, AMT, maxU, 1);
        vm.expectRevert(OnTheLine.ReviewEndOverflow.selector);
        _createWith(GOAL, referee, recipient, AMT, maxU - 5, 6);
        // exactly reaching uint64 max is fine
        uint256 id = _createWith(GOAL, referee, recipient, AMT, maxU - 5, 5);
        assertEq(ol.getPledge(id).reviewEnd, maxU);
        uint256 id2 = _createWith(GOAL, referee, recipient, AMT, maxU, 0);
        assertEq(ol.getPledge(id2).reviewEnd, maxU);
    }

    // ---------------------------------------------------------------- token failures
    function test_Create_InsufficientAllowanceReverts() public {
        vm.prank(staker);
        usdc.approve(address(ol), AMT - 1);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(ol), uint256(AMT - 1), uint256(AMT))
        );
        _create();
        assertEq(ol.pledgeCount(), 0);
        assertEq(ol.totalLocked(), 0);
    }

    function test_Create_InsufficientBalanceReverts() public {
        address poor = makeAddr("poor");
        usdc.mint(poor, AMT - 1);
        vm.prank(poor);
        usdc.approve(address(ol), type(uint256).max);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, poor, uint256(AMT - 1), uint256(AMT))
        );
        vm.prank(poor);
        ol.create(GOAL, referee, recipient, AMT, deadline, WINDOW);
        assertEq(ol.pledgeCount(), 0);
    }

    function test_Create_FeeOnTransferTokenReverts() public {
        FeeOnTransferToken fee = new FeeOnTransferToken();
        OnTheLine feeOl = new OnTheLine(address(fee));
        fee.mint(staker, 1_000e6);
        vm.prank(staker);
        fee.approve(address(feeOl), type(uint256).max);

        vm.expectRevert(abi.encodeWithSelector(OnTheLine.UnexpectedTokenBalanceDelta.selector, uint256(AMT), uint256(AMT - AMT / 100)));
        vm.prank(staker);
        feeOl.create(GOAL, referee, recipient, AMT, deadline, WINDOW);

        // whole tx rolled back
        assertEq(feeOl.pledgeCount(), 0);
        assertEq(feeOl.totalLocked(), 0);
        assertEq(fee.balanceOf(staker), 1_000e6);
        assertEq(fee.balanceOf(address(feeOl)), 0);
    }
}
