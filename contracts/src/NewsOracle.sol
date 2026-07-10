// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract NewsOracle {
    // Precompile addresses
    address constant HTTP_PRECOMPILE = address(0x0801);
    address constant LLM_PRECOMPILE  = address(0x0802);

    // System contracts
    address constant RITUAL_WALLET  = 0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948;
    address constant ASYNC_DELIVERY = 0x5A16214fF555848411544b005f7Ac063742f39F6;

    address public owner;

    struct ConvoMessage {
        string role;
        string model;
        string content;
    }

    struct NewsResult {
        string topic;
        string rawHeadlines;
        string summary;
        uint256 timestamp;
        bool hasSummary;
    }

    // queryId => result
    mapping(bytes32 => NewsResult) public results;

    // Store the latest result key per topic string for easy lookup
    mapping(string => bytes32) public latestResultKey;

    // Track query sequence
    uint256 public queryCount;

    event HeadlinesFetched(bytes32 indexed queryId, string topic, string headlines);
    event SummaryReady(bytes32 indexed queryId, string topic, string summary);
    event QuerySubmitted(bytes32 indexed queryId, string topic);

    error Unauthorized();
    error DepositFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyAsyncDelivery() {
        if (msg.sender != ASYNC_DELIVERY) revert Unauthorized();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // Deposit RITUAL into wallet for precompile fees
    function depositFees() external payable onlyOwner {
        (bool ok,) = RITUAL_WALLET.call{value: msg.value}(
            abi.encodeWithSignature("deposit(uint256)", 100000)
        );
        if (!ok) revert DepositFailed();
    }

    // Step 1: Fetch headlines via HTTP precompile
    // encodedHTTPRequest is built off-chain (see frontend lib/encode.ts)
    function fetchHeadlines(
        string calldata topic,
        bytes calldata encodedHTTPRequest
    ) external onlyOwner returns (bytes32 queryId) {
        queryId = keccak256(abi.encodePacked(topic, block.number, queryCount++));

        results[queryId] = NewsResult({
            topic: topic,
            rawHeadlines: '',
            summary: '',
            timestamp: block.timestamp,
            hasSummary: false
        });

        latestResultKey[topic] = queryId;

        emit QuerySubmitted(queryId, topic);

        (bool ok, bytes memory output) = HTTP_PRECOMPILE.call(encodedHTTPRequest);
        require(ok, "HTTP precompile call failed");

        // Decode the HTTP response (short-running async - result is inline)
        (, bytes memory actualOutput) = abi.decode(output, (bytes, bytes));

        if (actualOutput.length > 0) {
            (uint16 statusCode,,, bytes memory body, string memory errorMsg) =
                abi.decode(actualOutput, (uint16, string[], string[], bytes, string));

            if (bytes(errorMsg).length == 0 && statusCode == 200) {
                results[queryId].rawHeadlines = string(body);
                emit HeadlinesFetched(queryId, topic, string(body));
            }
        }

        return queryId;
    }

    // Step 2: Summarize headlines via LLM precompile
    // Call this after fetchHeadlines settles with headlines.
    // queryId MUST be the value returned by / emitted from fetchHeadlines -
    // it is NOT the transaction hash.
    function summarizeHeadlines(
        bytes32 queryId,
        bytes calldata encodedLLMRequest
    ) external onlyOwner {
        require(bytes(results[queryId].rawHeadlines).length > 0, "No headlines to summarize");

        (bool ok, bytes memory output) = LLM_PRECOMPILE.call(encodedLLMRequest);
        require(ok, "LLM precompile call failed");

        // Decode LLM response
        (, bytes memory actualOutput) = abi.decode(output, (bytes, bytes));

        if (actualOutput.length > 0) {
            _storeLLMResult(queryId, actualOutput);
        }
    }

    function _storeLLMResult(bytes32 queryId, bytes memory actualOutput) internal {
        // Outer LLM envelope: (bool hasError, bytes completionData, bytes rawOutput, string errorMessage, ConvoMessage convoHistory)
        (bool hasError, bytes memory completionData,, string memory errorMessage,) =
            abi.decode(actualOutput, (bool, bytes, bytes, string, ConvoMessage));

        if (hasError) {
            results[queryId].summary = string(abi.encodePacked("LLM error: ", errorMessage));
            return;
        }

        // For simplicity in Solidity, store the raw completion bytes.
        // The frontend decodes the full choice text for display.
        results[queryId].summary = string(completionData);
        results[queryId].hasSummary = true;

        emit SummaryReady(queryId, results[queryId].topic, results[queryId].summary);
    }

    // Read a result
    function getResult(bytes32 queryId) external view returns (NewsResult memory) {
        return results[queryId];
    }

    function getLatestResult(string calldata topic) external view returns (NewsResult memory) {
        return results[latestResultKey[topic]];
    }

    // Withdraw fees if needed
    function withdrawFees(uint256 amount) external onlyOwner {
        (bool ok,) = RITUAL_WALLET.call(
            abi.encodeWithSignature("withdraw(uint256)", amount)
        );
        require(ok, "withdraw failed");
    }

    receive() external payable {}
}