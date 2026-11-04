// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IBonzaiScoreVault {
    function setContributionScore(address wallet, uint32 score) external;
}

/**
 * @title BonzaiContributionScoreOracle
 * @notice Quorum-gated contribution-score oracle.
 *
 * A single evaluator can no longer push an arbitrary score to the vault. An
 * evaluation is identified by an explicit `roundId` and must gather an
 * owner-configurable quorum (never below two) of attestations from distinct,
 * currently-authorized evaluators that all agree on the exact
 * (wallet, score, evidenceHash) tuple. The vault is touched exactly once, only
 * when a round reaches quorum.
 *
 * Authorization epochs: every *effective* evaluator add/remove bumps
 * `evaluatorEpoch`. A round binds itself to the epoch it opened in, and any
 * later attestation is rejected as stale once that epoch no longer matches the
 * live one. Re-asserting an evaluator's existing authorization is a no-op (it
 * neither writes nor bumps the epoch), so idempotent reconfiguration does not
 * strand in-progress rounds. Changing the trusted evaluator set intentionally
 * strands every in-progress round; operators must open a fresh round (under the
 * new epoch) to re-evaluate. This is deliberate, not a bug.
 *
 * Round recovery: the first attestation binds a round to its tuple, so a
 * compromised evaluator can front-run an honest round id with a conflicting
 * tuple and block honest attestations with `RoundConflict`. `resetRound` clears
 * such a hijacked (non-finalized) round so it can be re-attested honestly; it
 * does not advance the global epoch, so it strands no other round.
 *
 * Quorum changes: `setQuorum` only replaces the value. A round that already met
 * the previous quorum is not finalized retroactively; `finalizeRound` lets any
 * caller close an already-quorate, non-stale round after a quorum is lowered.
 *
 * The oracle and vault addresses are fixed at deployment (the vault is
 * immutable and the oracle is registered once with the vault); they are left
 * unchanged here pending explicit redeployment.
 */
contract BonzaiContributionScoreOracle is Ownable {
    IBonzaiScoreVault public immutable stakingVault;

    uint8 public constant MIN_QUORUM = 2;

    /// Owner-configurable quorum; rounds finalize once `count >= quorum`.
    uint8 public quorum;
    /// Bumped on every authorization change. Pending rounds are bound to the
    /// epoch they opened in and go stale when this advances.
    uint64 public evaluatorEpoch;

    mapping(address => bool) public evaluators;

    struct Round {
        address wallet; // bound from the first attestation
        uint32 score;
        bytes32 evidenceHash;
        uint64 epoch; // evaluator-authorization epoch this round is bound to
        uint8 count; // distinct authorized evaluators that have matched the tuple
        bool finalized;
        address[] participants; // evaluators that attested, in arrival order
        mapping(address => bool) hasAttested;
    }
    mapping(bytes32 => Round) private rounds;

    event EvaluatorUpdated(address indexed evaluator, bool authorized, uint64 epoch);
    event QuorumUpdated(uint8 oldQuorum, uint8 newQuorum);
    event ScoreAttested(
        bytes32 indexed roundId,
        address indexed wallet,
        uint32 score,
        bytes32 indexed evidenceHash,
        address evaluator,
        uint64 epoch,
        uint8 count
    );
    event ScoreFinalized(
        bytes32 indexed roundId,
        address indexed wallet,
        uint32 score,
        bytes32 indexed evidenceHash,
        address[] evaluators,
        uint8 quorum
    );
    event RoundReset(bytes32 indexed roundId);

    error UnauthorizedEvaluator();
    error InvalidQuorum();
    error InvalidRound();
    error RoundConflict();
    error DuplicateEvaluator();
    error StaleRound();
    error RoundFinalized();
    error NotQuorate();

    constructor(address vault) Ownable(msg.sender) {
        require(vault != address(0), "Invalid vault");
        stakingVault = IBonzaiScoreVault(vault);
        quorum = MIN_QUORUM;
    }

    function setQuorum(uint8 newQuorum) external onlyOwner {
        if (newQuorum < MIN_QUORUM) revert InvalidQuorum();
        uint8 old = quorum;
        quorum = newQuorum;
        emit QuorumUpdated(old, newQuorum);
    }

    function setEvaluator(address evaluator, bool authorized) external onlyOwner {
        require(evaluator != address(0), "Invalid evaluator");
        // Idempotent: re-asserting an evaluator's existing authorization changes
        // nothing, so do not write and do not bump the epoch (an unnecessary bump
        // would strand every in-progress round for no reason).
        if (evaluators[evaluator] == authorized) return;
        evaluators[evaluator] = authorized;
        // Bumping the epoch strands every in-progress round: its bound epoch no
        // longer matches the live epoch, so further attestations revert with
        // StaleRound and it can never finalize. Changing the trusted evaluator
        // set must invalidate attestations collected under the previous set.
        unchecked {
            evaluatorEpoch++;
        }
        emit EvaluatorUpdated(evaluator, authorized, evaluatorEpoch);
    }

    /**
     * @notice Clear a non-finalized round so it can be re-attested honestly.
     * @dev A compromised evaluator can front-run a public round id with a
     *      conflicting tuple, blocking honest attestations with `RoundConflict`.
     *      This wipes the bound tuple and prior attestations so the round id is
     *      reusable. Iteration is bounded by the participant list (never larger
     *      than the authorized evaluator set). It intentionally does not bump
     *      `evaluatorEpoch`, so unrelated rounds are unaffected; removing the
     *      rogue evaluator is a separate `setEvaluator` call.
     */
    function resetRound(bytes32 roundId) external onlyOwner {
        if (roundId == bytes32(0)) revert InvalidRound();
        Round storage r = rounds[roundId];
        if (r.finalized) revert RoundFinalized();
        address[] storage participants = r.participants;
        for (uint256 i = 0; i < participants.length; i++) {
            r.hasAttested[participants[i]] = false;
        }
        delete r.participants;
        r.wallet = address(0);
        r.score = 0;
        r.evidenceHash = bytes32(0);
        r.epoch = 0;
        r.count = 0;
        emit RoundReset(roundId);
    }

    function getRound(bytes32 roundId)
        external
        view
        returns (
            address wallet,
            uint32 score,
            bytes32 evidenceHash,
            uint64 epoch,
            uint8 count,
            bool finalized
        )
    {
        Round storage r = rounds[roundId];
        return (r.wallet, r.score, r.evidenceHash, r.epoch, r.count, r.finalized);
    }

    function roundParticipants(bytes32 roundId) external view returns (address[] memory) {
        return rounds[roundId].participants;
    }

    /**
     * @notice Cast an attestation for an evaluation round.
     * @dev The first attestation binds the round to (wallet, score, evidenceHash,
     *      current epoch). Later attestations must match that tuple and the live
     *      epoch. On reaching quorum the round finalizes once and the vault is
     *      updated exactly once.
     */
    function attestScore(
        bytes32 roundId,
        address wallet,
        uint32 score,
        bytes32 evidenceHash
    ) external {
        if (!evaluators[msg.sender]) revert UnauthorizedEvaluator();
        if (roundId == bytes32(0) || wallet == address(0) || evidenceHash == bytes32(0)) {
            revert InvalidRound();
        }

        Round storage r = rounds[roundId];
        if (r.finalized) revert RoundFinalized();

        if (r.count == 0) {
            // First attestation binds the round to this exact tuple and epoch.
            r.wallet = wallet;
            r.score = score;
            r.evidenceHash = evidenceHash;
            r.epoch = evaluatorEpoch;
        } else {
            // A pending round whose epoch no longer matches the live one is stale.
            if (evaluatorEpoch != r.epoch) revert StaleRound();
            // Every subsequent attestation must agree on the bound tuple.
            if (r.wallet != wallet || r.score != score || r.evidenceHash != evidenceHash) {
                revert RoundConflict();
            }
            if (r.hasAttested[msg.sender]) revert DuplicateEvaluator();
        }

        r.hasAttested[msg.sender] = true;
        r.count += 1;
        r.participants.push(msg.sender);

        emit ScoreAttested(roundId, wallet, score, evidenceHash, msg.sender, r.epoch, r.count);

        if (r.count >= quorum) _finalize(r, roundId);
    }

    /**
     * @notice Finalize a round that already meets the current quorum.
     * @dev Required after `setQuorum` is lowered: a round that reached the old
     *      quorum cannot be closed by a fresh attestation (its existing
     *      participants are rejected as duplicates), so any caller may close it
     *      here. Safe to call openly: it only succeeds when the round is
     *      genuinely quorate, non-stale, and not yet finalized.
     */
    function finalizeRound(bytes32 roundId) external {
        Round storage r = rounds[roundId];
        if (r.finalized) revert RoundFinalized();
        if (r.count == 0) revert InvalidRound();
        if (r.epoch != evaluatorEpoch) revert StaleRound();
        if (r.count < quorum) revert NotQuorate();
        _finalize(r, roundId);
    }

    function _finalize(Round storage r, bytes32 roundId) internal {
        r.finalized = true;
        // The vault is touched exactly once, at finalization.
        stakingVault.setContributionScore(r.wallet, r.score);
        address[] memory participants = r.participants;
        emit ScoreFinalized(roundId, r.wallet, r.score, r.evidenceHash, participants, quorum);
    }
}
