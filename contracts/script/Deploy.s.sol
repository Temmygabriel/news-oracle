// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {NewsOracle} from "../src/NewsOracle.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        NewsOracle oracle = new NewsOracle();
        console.log("NewsOracle deployed to:", address(oracle));

        vm.stopBroadcast();
    }
}
