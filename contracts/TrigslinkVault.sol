// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract TrigslinkVault {
    address public trigslinkManager;

    struct Market {
        string marketId;
        bool resolved;
        uint8 finalOutcome;
        uint256 totalPool;
        uint256 outcome1Pool;
        uint256 outcome2Pool;
    }

    mapping(string => Market) public markets;

    // Mapping: marketId => userAddress => outcome(1 or 2) => amountBet
    mapping(string => mapping(address => mapping(uint8 => uint256))) public userBets;

    event BetPlaced(string indexed marketId, address indexed user, uint8 outcome, uint256 amount);
    event MarketResolved(string indexed marketId, uint8 outcome);
    event WinningsClaimed(string indexed marketId, address indexed user, uint256 payout);

    constructor(address _manager){
        trigslinkManager = _manager;
    }

// Users can deposit ETH and take a specific stance (Outcome 1 for "YES", Outcome 2 for "NO").

    function placeBet(string memory _marketId, uint8 _outcome) external payable {
        require(msg.value > 0, "Bet must be greater than 0");
        require(_outcome == 1 || _outcome == 2, "Invalid outcome. Use 1 or 2.");
        require(!markets[_marketId].resolved, "Market already settled");

        if (markets[_marketId].totalPool == 0) {
            markets[_marketId].marketId = _marketId;
        }

        markets[_marketId].totalPool += msg.value;

        if(_outcome == 1){
            markets[_marketId].outcome1Pool += msg.value;
        } else {
            markets[_marketId].outcome2Pool += msg.value;
        }

        userBets[_marketId][msg.sender][_outcome] += msg.value;
        
        emit BetPlaced(_marketId, msg.sender, _outcome, msg.value);
    }

// We stripped the human owner out of the contract. Only the specific trigslinkManager address is allowed to declare a winner.

    function resolveMarket(string memory _marketId, uint8 _outcome) external {
        require(msg.sender == trigslinkManager, "Only Trigslink Manager can resolve");
        require(_outcome == 1 || _outcome == 2, "Invalid outcome");
        require(!markets[_marketId].resolved, "Market already settled");

        markets[_marketId].resolved = true;
        markets[_marketId].finalOutcome = _outcome;

        emit MarketResolved(_marketId, _outcome);
    }

//When a market resolves, winners can instantly withdraw their funds. The contract calculates their exact share of the total pool based on how much they contributed to the winning side.

    function claimWinnings(string memory _marketId) external {
        require(markets[_marketId].resolved, "Markets not resolved yet");

        uint8 winningOutcome = markets[_marketId].finalOutcome;
        uint256 userBet = userBets[_marketId][msg.sender][winningOutcome];

        require(userBet > 0, "No winning bets to claim");

        userBets[_marketId][msg.sender][winningOutcome] = 0;

        uint256 winningPool = winningOutcome == 1 ? markets[_marketId].outcome1Pool : markets[_marketId].outcome2Pool;
        uint256 totalPool = markets[_marketId].totalPool;

        uint256 payout = (userBet * totalPool) / winningPool;

        (bool success, ) = payable(msg.sender).call{value: payout}("");
        require(success, "Transfer failed");

        emit WinningsClaimed(_marketId, msg.sender, payout);
    }
}