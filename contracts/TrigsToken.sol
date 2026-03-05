// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TrigsToken is ERC20 {
    constructor() ERC20("Trigslink Token", "TRIGS") {
        // Mint 1,000,000 tokens to the deployer (you) automatically
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }

    // The Sepolia Faucet: Any tester can call this to get 1,000 free TRIGS for voting
    function mintTestTokens() external {
        _mint(msg.sender, 1000 * 10 ** decimals());
    }
}