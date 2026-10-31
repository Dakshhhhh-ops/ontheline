// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {OnTheLine} from "../OnTheLine.sol";
import {MockUSDC} from "./mocks/Mocks.sol";

/// @dev Shared fixture. Contains no test functions.
abstract contract OnTheLineTestBase is Test {
    OnTheLine internal ol;
    MockUSDC internal usdc;

    address internal staker = makeAddr("staker");
    address internal referee = makeAddr("referee");
    address internal recipient = makeAddr("recipient");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant T0 = 1_000_000;
    uint128 internal constant AMT = 100e6;
    uint64 internal constant WINDOW = 3 days;
    string internal constant GOAL = "Run 5k every day";

    uint64 internal deadline;

    function setUp() public virtual {
        vm.warp(T0);
        usdc = new MockUSDC();
        ol = new OnTheLine(address(usdc));
        deadline = uint64(T0 + 7 days);
        usdc.mint(staker, 1_000_000e6);
        vm.prank(staker);
        usdc.approve(address(ol), type(uint256).max);
    }

    function _create() internal returns (uint256 id) {
        return _create(AMT, WINDOW);
    }

    function _create(uint128 amount, uint64 window) internal returns (uint256 id) {
        vm.prank(staker);
        id = ol.create(GOAL, referee, recipient, amount, deadline, window);
    }

    function _reviewEnd() internal view returns (uint64) {
        return deadline + WINDOW;
    }
}
