// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

contract TrigslinkVault is IReceiver {

    address public chainlinkForwarder;

    struct Market {
        string marketId;
        bool resolved;
        uint8 finalOutcome;
        uint256 totalPool;
        uint256 outcome1Pool;
        uint256 outcome2Pool;
        string question;
    }

    mapping(string => Market) public markets;
    // Mapping: marketId => userAddress => outcome(1 or 2) => amountBet
    mapping(string => mapping(address => mapping(uint8 => uint256))) public userBets;

    
    event MarketCreated(string indexed marketId, string question);
    event BetPlaced(string indexed marketId, address indexed user, uint8 outcome, uint256 amount);

    // The critical event that wakes up offchain ai workflow
    event SettlementRequested(string indexed marketId, string question);
    event MarketResolved(string indexed marketId, uint8 outcome);
    event WinningsClaimed(string indexed marketId, address indexed user, uint256 payout);

    constructor(address _chainlinkForwarder){
        chainlinkForwarder = _chainlinkForwarder;
    }

    function createMarket(string memory _marketId, string memory _question) external {
        require(bytes(markets[_marketId].marketId).length == 0, "Market Exists");
        markets[_marketId] = Market(_marketId, false, 0, 0, 0, 0, _question);
        emit MarketCreated(_marketId, _question);
    }

    function placeBet(string memory _marketId, uint8 _outcome) external payable {
        require(msg.value > 0, "Bet must be greater than 0");
        require(_outcome == 1 || _outcome == 2, "Invalid outcome. Use 1 or 2.");
        require(!markets[_marketId].resolved, "Market already settled");
        
        // THE FIX: Ensure the market was actually created first!
        // This guarantees the AI has a valid question to read during settlement.
        require(bytes(markets[_marketId].marketId).length != 0, "Market does not exist");

        markets[_marketId].totalPool += msg.value;

        if(_outcome == 1){
            markets[_marketId].outcome1Pool += msg.value;
        } else {
            markets[_marketId].outcome2Pool += msg.value;
        }

        userBets[_marketId][msg.sender][_outcome] += msg.value;
        
        emit BetPlaced(_marketId, msg.sender, _outcome, msg.value);
    }


    function requestSettlement(string memory _marketId) external{
        require(!markets[_marketId].resolved, "Market already settled");
        emit SettlementRequested(_marketId, markets[_marketId].question);
    }


    function onReport(bytes calldata /* metadata */, bytes calldata report) external override {
        require(msg.sender == chainlinkForwarder, "Only Chainlink DON can resolve");

        //Decodes the data came from TS workflow
        (string memory marketId, uint8 outcome) = abi.decode(report, (string, uint8));

        require(!markets[marketId].resolved, "Market already settled");
        require(outcome == 1  || outcome == 2, "Invalid AI response");

        markets[marketId].resolved = true;
        markets[marketId].finalOutcome = outcome;

        emit MarketResolved(marketId, outcome);
    }


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