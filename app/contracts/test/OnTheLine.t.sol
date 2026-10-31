// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OnTheLine} from "../OnTheLine.sol";
import {OnTheLineTestBase} from "./OnTheLine.Base.t.sol";

/// @dev Lifecycle: confirm / fail / settleExpired, access control, timing, double-resolution.
contract OnTheLineTest is OnTheLineTestBase {
    // ---------------------------------------------------------------- constructor
    function test_Constructor_SetsTokenAndAlias() public view {
        assertEq(address(ol.token()), address(usdc));
        assertEq(address(ol.usdc()), address(usdc));
        assertEq(ol.MAX_PAGE(), 100);
    }

    function test_Constructor_ZeroTokenReverts() public {
        vm.expectRevert(OnTheLine.InvalidToken.selector);
        new OnTheLine(address(0));
    }

    // ---------------------------------------------------------------- confirm
    function test_Confirm_RefundsStakerAndMarksKept() public {
        uint256 id = _create();
        uint256 stakerBefore = usdc.balanceOf(staker);
        assertEq(usdc.balanceOf(address(ol)), AMT);

        vm.expectEmit(true, true, false, true, address(ol));
        emit OnTheLine.PledgeKept(id, staker, AMT);
        vm.prank(referee);
        ol.confirm(id);

        assertEq(usdc.balanceOf(staker), stakerBefore + AMT);
        assertEq(usdc.balanceOf(address(ol)), 0);
        assertEq(uint8(ol.getPledge(id).status), uint8(OnTheLine.Status.Kept));
        assertEq(ol.totalLocked(), 0);
        assertEq(ol.totalKept(), AMT);
        assertEq(ol.totalForfeited(), 0);
    }

    function test_Confirm_BeforeDeadlineSucceeds() public {
        uint256 id = _create();
        assertLt(block.timestamp, deadline);
        vm.prank(referee);
        ol.confirm(id);
        assertEq(uint8(ol.getPledge(id).status), uint8(OnTheLine.Status.Kept));
    }

    function test_Confirm_AtExactlyReviewEndSucceeds() public {
        uint256 id = _create();
        vm.warp(_reviewEnd());
        vm.prank(referee);
        ol.confirm(id);
        assertEq(uint8(ol.getPledge(id).status), uint8(OnTheLine.Status.Kept));
    }

    function test_Confirm_AfterReviewEndReverts() public {
        uint256 id = _create();
        vm.warp(uint256(_reviewEnd()) + 1);
        vm.expectRevert(abi.encodeWithSelector(OnTheLine.ReviewEnded.selector, id, _reviewEnd()));
        vm.prank(referee);
        ol.confirm(id);
        assertEq(uint8(ol.getPledge(id).status), uint8(OnTheLine.Status.Active));
    }

    function test_Confirm_ZeroWindowCutoffIsDeadline() public {
        uint256 id = _create(AMT, 0);
        uint256 id2 = _create(AMT, 0);
        vm.warp(deadline);
        vm.prank(referee);
        ol.confirm(id);
        vm.warp(uint256(deadline) + 1);
        vm.expectRevert(abi.encodeWithSelector(OnTheLine.ReviewEnded.selector, id2, deadline));
        vm.prank(referee);
        ol.confirm(id2);
    }

    // ---------------------------------------------------------------- fail
    function test_Fail_EarlyBeforeDeadlinePaysRecipient() public {
        uint256 id = _create();
        assertLt(block.timestamp, deadline);

        vm.expectEmit(true, true, false, true, address(ol));
        emit OnTheLine.PledgeForfeited(id, recipient, AMT, false);
        vm.prank(referee);
        ol.fail(id);

        assertEq(usdc.balanceOf(recipient), AMT);
        assertEq(usdc.balanceOf(address(ol)), 0);
        assertEq(uint8(ol.getPledge(id).status), uint8(OnTheLine.Status.Forfeited));
        assertEq(ol.totalLocked(), 0);
        assertEq(ol.totalForfeited(), AMT);
        assertEq(ol.totalKept(), 0);
    }

    function test_Fail_AfterReviewEndStillAllowedForReferee() public {
        uint256 id = _create();
        vm.warp(uint256(_reviewEnd()) + 100);
        vm.prank(referee);
        ol.fail(id);
        assertEq(usdc.balanceOf(recipient), AMT);
    }

    // ---------------------------------------------------------------- settleExpired
    function test_SettleExpired_ByStrangerAfterReviewEnd() public {
        uint256 id = _create();
        vm.warp(uint256(_reviewEnd()) + 1);

        vm.expectEmit(true, true, false, true, address(ol));
        emit OnTheLine.PledgeForfeited(id, recipient, AMT, true);
        vm.prank(stranger);
        ol.settleExpired(id);

        assertEq(usdc.balanceOf(recipient), AMT);
        assertEq(usdc.balanceOf(stranger), 0);
        assertEq(uint8(ol.getPledge(id).status), uint8(OnTheLine.Status.Forfeited));
        assertEq(ol.totalForfeited(), AMT);
        assertEq(ol.totalLocked(), 0);
    }

    function test_SettleExpired_AtExactlyReviewEndReverts() public {
        uint256 id = _create();
        vm.warp(_reviewEnd());
        vm.expectRevert(abi.encodeWithSelector(OnTheLine.NotExpired.selector, id, _reviewEnd()));
        vm.prank(stranger);
        ol.settleExpired(id);
    }

    function test_SettleExpired_BeforeReviewEndReverts() public {
        uint256 id = _create();
        vm.expectRevert(abi.encodeWithSelector(OnTheLine.NotExpired.selector, id, _reviewEnd()));
        vm.prank(stranger);
        ol.settleExpired(id);

        vm.warp(deadline); // past deadline but within review window
        vm.expectRevert(abi.encodeWithSelector(OnTheLine.NotExpired.selector, id, _reviewEnd()));
        vm.prank(stranger);
        ol.settleExpired(id);
    }

    function testFuzz_Timing_ConfirmXorSettle(uint64 offset) public {
        uint256 id = _create();
        uint256 t = bound(offset, 0, 60 days) + T0;
        vm.warp(t);
        if (t <= _reviewEnd()) {
            vm.expectRevert(abi.encodeWithSelector(OnTheLine.NotExpired.selector, id, _reviewEnd()));
            vm.prank(stranger);
            ol.settleExpired(id);
            vm.prank(referee);
            ol.confirm(id);
            assertEq(uint8(ol.getPledge(id).status), uint8(OnTheLine.Status.Kept));
        } else {
            vm.expectRevert(abi.encodeWithSelector(OnTheLine.ReviewEnded.selector, id, _reviewEnd()));
            vm.prank(referee);
            ol.confirm(id);
            vm.prank(stranger);
            ol.settleExpired(id);
            assertEq(uint8(ol.getPledge(id).status), uint8(OnTheLine.Status.Forfeited));
        }
    }

    // ---------------------------------------------------------------- access control
    function test_NonReferee_CannotConfirm() public {
        uint256 id = _create();
        address[3] memory callers = [staker, stranger, recipient];
        for (uint256 i; i < callers.length; ++i) {
            vm.expectRevert(abi.encodeWithSelector(OnTheLine.NotReferee.selector, id, callers[i]));
            vm.prank(callers[i]);
            ol.confirm(id);
        }
        assertEq(uint8(ol.getPledge(id).status), uint8(OnTheLine.Status.Active));
    }

    function test_NonReferee_CannotFail() public {
        uint256 id = _create();
        address[3] memory callers = [staker, stranger, recipient];
        for (uint256 i; i < callers.length; ++i) {
            vm.expectRevert(abi.encodeWithSelector(OnTheLine.NotReferee.selector, id, callers[i]));
            vm.prank(callers[i]);
            ol.fail(id);
        }
        assertEq(uint8(ol.getPledge(id).status), uint8(OnTheLine.Status.Active));
        assertEq(usdc.balanceOf(address(ol)), AMT);
    }

    // ---------------------------------------------------------------- double resolution
    function _resolveConfirm(uint256 id) internal {
        vm.prank(referee);
        ol.confirm(id);
    }

    function _resolveFail(uint256 id) internal {
        vm.prank(referee);
        ol.fail(id);
    }

    function _resolveSettle(uint256 id) internal {
        vm.warp(uint256(_reviewEnd()) + 1);
        vm.prank(stranger);
        ol.settleExpired(id);
    }

    function _expectNotActive(uint256 id) internal {
        vm.expectRevert(abi.encodeWithSelector(OnTheLine.PledgeNotActive.selector, id));
    }

    function _secondConfirm(uint256 id) internal {
        _expectNotActive(id);
        vm.prank(referee);
        ol.confirm(id);
    }

    function _secondFail(uint256 id) internal {
        _expectNotActive(id);
        vm.prank(referee);
        ol.fail(id);
    }

    function _secondSettle(uint256 id) internal {
        vm.warp(uint256(_reviewEnd()) + 1);
        _expectNotActive(id);
        vm.prank(stranger);
        ol.settleExpired(id);
    }

    function test_Double_ConfirmThenConfirm() public {
        uint256 id = _create();
        _resolveConfirm(id);
        _secondConfirm(id);
    }

    function test_Double_ConfirmThenFail() public {
        uint256 id = _create();
        _resolveConfirm(id);
        _secondFail(id);
    }

    function test_Double_ConfirmThenSettle() public {
        uint256 id = _create();
        _resolveConfirm(id);
        _secondSettle(id);
    }

    function test_Double_FailThenConfirm() public {
        uint256 id = _create();
        _resolveFail(id);
        _secondConfirm(id);
    }

    function test_Double_FailThenFail() public {
        uint256 id = _create();
        _resolveFail(id);
        _secondFail(id);
    }

    function test_Double_FailThenSettle() public {
        uint256 id = _create();
        _resolveFail(id);
        _secondSettle(id);
    }

    function test_Double_SettleThenConfirm() public {
        uint256 id = _create();
        _resolveSettle(id);
        _secondConfirm(id);
    }

    function test_Double_SettleThenFail() public {
        uint256 id = _create();
        _resolveSettle(id);
        _secondFail(id);
    }

    function test_Double_SettleThenSettle() public {
        uint256 id = _create();
        _resolveSettle(id);
        _secondSettle(id);
    }

    function test_Double_DoesNotMovePayoutTwice() public {
        uint256 id = _create();
        _resolveFail(id);
        _secondFail(id);
        assertEq(usdc.balanceOf(recipient), AMT);
        assertEq(ol.totalForfeited(), AMT);
    }

    // ---------------------------------------------------------------- nonexistent id
    function test_NonexistentId_Reverts() public {
        bytes memory err = abi.encodeWithSelector(OnTheLine.NonexistentPledge.selector, uint256(0));
        vm.expectRevert(err);
        ol.getPledge(0);
        vm.expectRevert(err);
        vm.prank(referee);
        ol.confirm(0);
        vm.expectRevert(err);
        vm.prank(referee);
        ol.fail(0);
        vm.expectRevert(err);
        ol.settleExpired(0);

        _create();
        vm.expectRevert(abi.encodeWithSelector(OnTheLine.NonexistentPledge.selector, uint256(1)));
        ol.getPledge(1);
        vm.expectRevert(abi.encodeWithSelector(OnTheLine.NonexistentPledge.selector, type(uint256).max));
        ol.settleExpired(type(uint256).max);
    }
}
