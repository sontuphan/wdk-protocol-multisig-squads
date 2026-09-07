/**
 * Builds the coordinator an account votes through, from the member's own signer account. One
 * configuration is shared by every account a manager derives, and each of those signs with a
 * different key, so the configuration carries this rather than a coordinator instance.
 */
export type MultisigCoordinatorFactory = (signerAccount: import("@tetherto/wdk-wallet-solana").WalletAccountSolana) => IMultisigCoordinator;
/**
 * Coordinator for collecting a proposal's approvals into one transaction, which is what turns the
 * N+2 transactions a Squads proposal costs into the three of `docs/COORDINATOR.md`.
 *
 * Creating a proposal, rejecting it and executing it are each one member's own transaction and
 * never reach a coordinator. Approvals do. Each member appends its own to the transaction
 * `getProposal` hands back and has `confirmProposal` sign it; while the approvals in it are short
 * of the threshold `submitProposal` keeps it circulating, and once they meet it the account
 * broadcasts it. So a coordinator signs and holds, and never reaches the cluster itself.
 *
 * `submitProposal` resolves late, with the hash and fee of the transaction that eventually carries
 * the approvals it was given, which is what keeps the account's non-nullable `hash` honest. Three
 * is the floor, not the count: a message over the 1232-byte limit, or a threshold reached in
 * stages, splits the collecting transaction.
 *
 * The contract deliberately has no proposal storage, no message sharing and no quoting: votes are
 * on-chain instructions, so the read-only account reads them from the cluster, and all a
 * coordinator holds is the transaction still being signed. Nor does it own an identity: the account
 * votes as the member it derived, and `getSignerAddress()` answers from that account, so the two
 * can never disagree.
 *
 * @interface
 */
export interface IMultisigCoordinator {
    /**
     * Takes the partially signed transaction a proposal's votes are accumulating in, to keep
     * circulating among the members while it is short of the threshold. Resolving late is the point:
     * the promise settles when whoever completes the threshold broadcasts it, which is what keeps
     * the account's `hash` non-nullable.
     *
     * @param {string} proposalId - The proposal (transaction index) id.
     * @param {SolanaTransaction} proposal - The transaction as this member signed it, carrying every approval collected so far.
     * @returns {Promise<TransactionResult>} The signature and fee of the transaction that eventually carries these approvals.
     */
    submitProposal(proposalId: string, proposal: import("@tetherto/wdk-wallet-solana").SolanaTransaction): Promise<import("@tetherto/wdk-wallet").TransactionResult>;
    /**
     * Returns the partially signed transaction the coordinator is circulating for a proposal, so
     * that the next member can add its own vote to it rather than opening a second one.
     *
     * @param {string} proposalId - The proposal (transaction index) id.
     * @returns {Promise<SolanaTransaction | null>} The transaction, whose instructions carry the votes signed so far, or null when the coordinator is circulating none for that id.
     */
    getProposal(proposalId: string): Promise<import("@tetherto/wdk-wallet-solana").SolanaTransaction | null>;
    /**
     * Signs the member's approval. Signing is all it does: the account decides whether the result
     * keeps circulating or goes to the cluster.
     *
     * @param {SolanaTransaction} proposal - The transaction to sign. Its instructions carry the approvals signed so far plus this member's, and the execution too when this vote reaches the threshold.
     * @returns {Promise<SolanaTransaction>} The transaction with this member's signature added.
     */
    confirmProposal(proposal: import("@tetherto/wdk-wallet-solana").SolanaTransaction): Promise<import("@tetherto/wdk-wallet-solana").SolanaTransaction>;
}
