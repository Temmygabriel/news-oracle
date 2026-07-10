// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {NewsOracle} from "../src/NewsOracle.sol";

// NOTE: these tests only cover local logic (ownership, storage, deposits).
// They do NOT hit the real HTTP/LLM precompiles - those only exist on the
// live Ritual Chain testnet, not in a plain forge/anvil environment.
contract NewsOracleTest is Test {
    NewsOracle oracle;
    address owner = address(this);
    address stranger = address(0xBEEF);

    function setUp() public {
        oracle = new NewsOracle();
    }

    function test_OwnerIsDeployer() public view {
        assertEq(oracle.owner(), owner);
    }

    function test_NonOwnerCannotFetchHeadlines() public {
        vm.prank(stranger);
        vm.expectRevert(NewsOracle.Unauthorized.selector);
        oracle.fetchHeadlines("Bitcoin", "");
    }

    function test_NonOwnerCannotDeposit() public {
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        vm.expectRevert(NewsOracle.Unauthorized.selector);
        oracle.depositFees{value: 1 ether}();
    }

    function test_GetLatestResultForUnknownTopicIsEmpty() public view {
        NewsOracle.NewsResult memory r = oracle.getLatestResult("nonexistent-topic");
        assertEq(bytes(r.topic).length, 0);
        assertEq(r.hasSummary, false);
    }
}
