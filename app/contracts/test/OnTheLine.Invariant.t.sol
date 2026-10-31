// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {OnTheLine} from "../OnTheLine.sol";
import {MockUSDC} from "./mocks/Mocks.sol";

/// @dev Handler driving bounded create / confirm / fail / settle / warp actions.
contract OnTheLineHandler is Test {
    OnTheLine public immutable ol;
    MockUSDC public immutable usdc;

    address[3] public referees;
    address[3] public recipients;

    uint256 public ghostCreatedAmount;
    uint256 public ghostCreatedCount;
    uint256 public ghostKept;
    uint256 public ghostForfeited;

    constructor(OnTheLine _ol, MockUSDC _usdc) {
        ol = _ol;
        usdc = _usdc;
        for (uint256 i; i < 3; ++i) {
            referees[i] = makeAddr(string.concat("hRef", vm.toString(i)));
            recipients[i] = makeAddr(string.concat("hRec", vm.toString(i)));
        }
        usdc.approve(address(ol), type(uint256).max);
    }

    function create(uint256 amountSeed, uint256 deadlineSeed, uint256 windowSeed, uint256 actorSeed) external {
        uint128 amount = uint128(bound(amountSeed, 1, 1_000e6));
        uint64 dl = uint64(block.timestamp + bound(deadlineSeed, 1, 30 days));
        uint64 window = uint64(bound(windowSeed, 0, 30 days));
        usdc.mint(address(this), amount);
        ol.create("goal", referees[actorSeed % 3], recipients[(actorSeed / 3) % 3], amount, dl, window);
        ghostCreatedAmount += amount;
        ghostCreatedCount++;
    }

    function confirm(uint256 idSeed) external {
        uint256 n = ol.pledgeCount();
        if (n == 0) return;
        uint256 id = idSeed % n;
        OnTheLine.Pledge memory p = ol.getPledge(id);
        if (p.status != OnTheLine.Status.Active || block.timestamp > p.reviewEnd) return;
        vm.prank(p.referee);
        ol.confirm(id);
        ghostKept += p.amount;
    }

    function fail(uint256 idSeed) external {
        uint256 n = ol.pledgeCount();
        if (n == 0) return;
        uint256 id = idSeed % n;
        OnTheLine.Pledge memory p = ol.getPledge(id);
        if (p.status != OnTheLine.Status.Active) return;
        vm.prank(p.referee);
        ol.fail(id);
        ghostForfeited += p.amount;
    }

    function settleExpired(uint256 idSeed, address caller) external {
        uint256 n = ol.pledgeCount();
        if (n == 0) return;
        uint256 id = idSeed % n;
        OnTheLine.Pledge memory p = ol.getPledge(id);
        if (p.status != OnTheLine.Status.Active || block.timestamp <= p.reviewEnd) return;
        vm.prank(caller);
        ol.settleExpired(id);
        ghostForfeited += p.amount;
    }

    function warp(uint256 delta) external {
        vm.warp(block.timestamp + bound(delta, 0, 20 days));
    }
}

contract OnTheLineInvariantTest is Test {
    OnTheLine internal ol;
    MockUSDC internal usdc;
    OnTheLineHandler internal handler;

    function setUp() public {
        vm.warp(1_000_000);
        usdc = new MockUSDC();
        ol = new OnTheLine(address(usdc));
        handler = new OnTheLineHandler(ol, usdc);

        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](5);
        selectors[0] = OnTheLineHandler.create.selector;
        selectors[1] = OnTheLineHandler.confirm.selector;
        selectors[2] = OnTheLineHandler.fail.selector;
        selectors[3] = OnTheLineHandler.settleExpired.selector;
        selectors[4] = OnTheLineHandler.warp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// custody always equals the sum of Active pledge amounts
    function invariant_BalanceEqualsTotalLocked() public view {
        assertEq(usdc.balanceOf(address(ol)), ol.totalLocked());
    }

    /// every created unit is either locked, kept or forfeited
    function invariant_ConservationOfCreatedAmount() public view {
        assertEq(ol.totalLocked() + ol.totalKept() + ol.totalForfeited(), handler.ghostCreatedAmount());
    }

    /// on-chain counters agree with the handler's independent bookkeeping
    function invariant_GhostAgreesWithContract() public view {
        assertEq(ol.pledgeCount(), handler.ghostCreatedCount());
        assertEq(ol.totalKept(), handler.ghostKept());
        assertEq(ol.totalForfeited(), handler.ghostForfeited());
    }
}
