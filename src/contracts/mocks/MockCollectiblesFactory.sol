// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockCollectiblesFactory {
    mapping(address => address) public collections;

    function setCollection(address owner, address collection) external {
        collections[owner] = collection;
    }
}
