// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OnTheLine} from "../OnTheLine.sol";
import {OnTheLineTestBase} from "./OnTheLine.Base.t.sol";

/// @dev getPledge, stats accounting, index arrays / counts / paging, and create() fuzzing.
contract OnTheLineViewsTest is OnTheLineTestBase {
    address internal ref2 = makeAddr("ref2");
    address internal rec2 = makeAddr("rec2");

    // ---------------------------------------------------------------- getPledge
    function test_GetPledge_ReturnsAllFields() public {
        vm.prank(staker);
        uint256 id = ol.create("Ship the thing", referee, recipient, 42e6, deadline, 5 days);
        OnTheLine.Pledge memory p = ol.getPledge(id);
        assertEq(p.staker, staker);
        assertEq(p.referee, referee);
        assertEq(p.forfeitTo, recipient);
        assertEq(p.amount, 42e6);
        assertEq(p.deadline, deadline);
        assertEq(p.reviewEnd, deadline + 5 days);
        assertEq(uint8(p.status), uint8(OnTheLine.Status.Active));
        assertEq(p.goal, "Ship the thing");
    }

    // ---------------------------------------------------------------- stats
    function test_Stats_AcrossSeveralPledges() public {
        uint256 a = _create(10e6, WINDOW);
        uint256 b = _create(20e6, WINDOW);
        uint256 c = _create(30e6, WINDOW);
        uint256 d = _create(40e6, WINDOW);
        assertEq(ol.totalLocked(), 100e6);

        vm.prank(referee);
        ol.confirm(a); // kept 10
        vm.prank(referee);
        ol.fail(b); // forfeited 20
        assertEq(ol.totalLocked(), 70e6);
        assertEq(ol.totalKept(), 10e6);
        assertEq(ol.totalForfeited(), 20e6);

        vm.warp(uint256(_reviewEnd()) + 1);
        ol.settleExpired(c); // forfeited 30
        assertEq(ol.totalLocked(), 40e6);
        assertEq(ol.totalKept(), 10e6);
        assertEq(ol.totalForfeited(), 50e6);
        assertEq(usdc.balanceOf(address(ol)), 40e6);

        ol.settleExpired(d);
        assertEq(ol.totalLocked(), 0);
        assertEq(ol.totalKept(), 10e6);
        assertEq(ol.totalForfeited(), 90e6);
        assertEq(usdc.balanceOf(address(ol)), 0);
        assertEq(usdc.balanceOf(recipient), 90e6);
    }

    function test_Stats_UnsolicitedTransferDoesNotChangeTotalLocked() public {
        _create();
        vm.prank(staker);
        usdc.transfer(address(ol), 5e6);
        assertEq(ol.totalLocked(), AMT);
        assertEq(usdc.balanceOf(address(ol)), uint256(AMT) + 5e6);
    }

    // ---------------------------------------------------------------- index arrays
    function _createFor(address ref, address to) internal returns (uint256 id) {
        vm.prank(staker);
        id = ol.create(GOAL, ref, to, 1e6, deadline, WINDOW);
    }

    function test_Indexes_ArraysAndCounts() public {
        _createFor(referee, recipient); // 0
        _createFor(ref2, recipient); // 1
        _createFor(referee, rec2); // 2

        uint256[] memory s = ol.pledgesByStaker(staker);
        assertEq(s.length, 3);
        assertEq(s[0], 0);
        assertEq(s[1], 1);
        assertEq(s[2], 2);

        uint256[] memory r = ol.pledgesByReferee(referee);
        assertEq(r.length, 2);
        assertEq(r[0], 0);
        assertEq(r[1], 2);
        assertEq(ol.pledgesByReferee(ref2).length, 1);

        uint256[] memory t = ol.pledgesByRecipient(recipient);
        assertEq(t.length, 2);
        assertEq(t[0], 0);
        assertEq(t[1], 1);
        assertEq(ol.pledgesByRecipient(rec2)[0], 2);

        assertEq(ol.stakerPledgeCount(staker), 3);
        assertEq(ol.refereePledgeCount(referee), 2);
        assertEq(ol.refereePledgeCount(ref2), 1);
        assertEq(ol.recipientPledgeCount(recipient), 2);
        assertEq(ol.recipientPledgeCount(rec2), 1);

        // unrelated addresses are empty
        assertEq(ol.pledgesByStaker(stranger).length, 0);
        assertEq(ol.stakerPledgeCount(stranger), 0);
        assertEq(ol.refereePledgeCount(stranger), 0);
        assertEq(ol.recipientPledgeCount(stranger), 0);
    }

    function test_Indexes_ResolvedPledgesRemainListed() public {
        uint256 id = _createFor(referee, recipient);
        vm.prank(referee);
        ol.confirm(id);
        assertEq(ol.stakerPledgeCount(staker), 1);
        assertEq(ol.refereePledgeCount(referee), 1);
        assertEq(ol.recipientPledgeCount(recipient), 1);
        assertEq(ol.pledgesByStaker(staker)[0], id);
    }

    // ---------------------------------------------------------------- paging
    function _seed(uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            _createFor(referee, recipient);
        }
    }

    function test_Page_BasicSlices() public {
        _seed(10);
        uint256[] memory p = ol.pledgesByStakerPage(staker, 2, 3);
        assertEq(p.length, 3);
        assertEq(p[0], 2);
        assertEq(p[1], 3);
        assertEq(p[2], 4);

        // limit larger than remaining -> truncated
        p = ol.pledgesByRefereePage(referee, 8, 50);
        assertEq(p.length, 2);
        assertEq(p[0], 8);
        assertEq(p[1], 9);

        p = ol.pledgesByRecipientPage(recipient, 0, 10);
        assertEq(p.length, 10);
        assertEq(p[9], 9);

        // limit 0
        assertEq(ol.pledgesByStakerPage(staker, 0, 0).length, 0);
    }

    function test_Page_OffsetAtOrBeyondLengthIsEmpty() public {
        _seed(5);
        assertEq(ol.pledgesByStakerPage(staker, 5, 10).length, 0);
        assertEq(ol.pledgesByStakerPage(staker, 6, 10).length, 0);
        assertEq(ol.pledgesByRefereePage(referee, 1000, 10).length, 0);
        assertEq(ol.pledgesByRecipientPage(recipient, type(uint256).max, type(uint256).max).length, 0);
        assertEq(ol.pledgesByStakerPage(stranger, 0, 10).length, 0);
    }

    function test_Page_LimitClampedTo100() public {
        _seed(105);
        uint256[] memory p = ol.pledgesByStakerPage(staker, 0, 1000);
        assertEq(p.length, 100);
        assertEq(p[99], 99);
        assertEq(ol.pledgesByRefereePage(referee, 0, type(uint256).max).length, 100);
        assertEq(ol.pledgesByRecipientPage(recipient, 0, 101).length, 100);

        // second page: remaining 5, no overflow with huge limit
        p = ol.pledgesByStakerPage(staker, 100, type(uint256).max);
        assertEq(p.length, 5);
        assertEq(p[0], 100);
        assertEq(p[4], 104);
        // offset in the middle, clamped by MAX_PAGE
        p = ol.pledgesByStakerPage(staker, 3, 500);
        assertEq(p.length, 100);
        assertEq(p[0], 3);
        assertEq(p[99], 102);
    }

    // ---------------------------------------------------------------- fuzz
    function testFuzz_Create_AmountDeadlineWindow(uint256 amountRaw, uint256 deadlineRaw, uint64 windowRaw, uint8 mode) public {
        uint128 amount = uint128(bound(amountRaw, 1, 1_000_000e6));
        uint64 dl = uint64(bound(deadlineRaw, T0 + 1, type(uint64).max));
        if (mode % 3 == 0) {
            // force deadline close to uint64 max so overflow branch is exercised
            dl = type(uint64).max - uint64(deadlineRaw % 40 days);
        }
        uint64 window = windowRaw;
        if (mode % 2 == 0) window = uint64(bound(windowRaw, 0, 31 days)); // straddle the 30-day limit

        uint256 stakerBefore = usdc.balanceOf(staker);
        bool windowTooLong = window > 30 days;
        bool overflows = uint256(dl) + uint256(window) > type(uint64).max;

        if (windowTooLong) {
            vm.expectRevert(OnTheLine.InvalidReviewWindow.selector);
        } else if (overflows) {
            vm.expectRevert(OnTheLine.ReviewEndOverflow.selector);
        }
        vm.prank(staker);
        uint256 id = ol.create(GOAL, referee, recipient, amount, dl, window);

        if (windowTooLong || overflows) {
            assertEq(ol.pledgeCount(), 0);
            assertEq(ol.totalLocked(), 0);
            assertEq(usdc.balanceOf(staker), stakerBefore);
        } else {
            OnTheLine.Pledge memory p = ol.getPledge(id);
            assertEq(p.amount, amount);
            assertEq(p.deadline, dl);
            assertEq(uint256(p.reviewEnd), uint256(dl) + uint256(window));
            assertEq(ol.totalLocked(), amount);
            assertEq(usdc.balanceOf(address(ol)), amount);
            assertEq(usdc.balanceOf(staker), stakerBefore - amount);
        }
    }

    function testFuzz_ConfirmRefundsExactAmount(uint256 amountRaw) public {
        uint128 amount = uint128(bound(amountRaw, 1, 1_000_000e6));
        uint256 id = _create(amount, WINDOW);
        uint256 before_ = usdc.balanceOf(staker);
        vm.prank(referee);
        ol.confirm(id);
        assertEq(usdc.balanceOf(staker), before_ + amount);
        assertEq(ol.totalKept(), amount);
    }
}
