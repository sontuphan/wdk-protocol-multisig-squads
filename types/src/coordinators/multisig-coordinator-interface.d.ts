/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@solana/transactions').Transaction} Transaction */
/**
 * What a coordinator is given of the member it signs for: its address, and a way to add its
 * signature to a compiled transaction.
 *
 * @typedef {Object} CoordinatorSigner
 * @property {() => Promise<string>} getAddress - Returns the member's address.
 * @property {(tx: Transaction) => Promise<Transaction>} partiallySignTransaction - Puts this member's signature in its slot of a compiled transaction, leaving every other slot alone.
 */
/**
 * Builds the coordinator an account votes through. One configuration is shared by every account a
 * manager derives, and each signs with a different key, so it carries a factory rather than an
 * instance.
 *
 * @typedef {(config: CoordinatorSigner) => IMultisigCoordinator} MultisigCoordinatorFactory
 */
/**
 * Coordinator for collecting a proposal's approvals into one transaction.
 *
 * A coordinator decides which members will approve, builds their approvals and the execution if one
 * rides along, fixes the fee payer and the lifetime, and compiles. `getProposal` hands that bundle
 * to a member, `confirmProposal` puts the member's signature in its slot, and `submitProposal`
 * holds it while slots are still empty. The member that fills the last one broadcasts, so a
 * coordinator never reaches the cluster itself. Creating a proposal, rejecting it and executing it
 * never reach a coordinator at all.
 *
 * Implementations extend this class, which holds the configuration and leaves every method to them.
 *
 * @template {CoordinatorSigner} [TCoordinatorConfig=CoordinatorSigner]
 */
export class IMultisigCoordinator<TCoordinatorConfig extends CoordinatorSigner = CoordinatorSigner> {
    /**
     * Creates a coordinator over its configuration.
     *
     * @param {TCoordinatorConfig} config - The member's signer, widened by whatever the implementation needs.
     */
    constructor(config: TCoordinatorConfig);
    /**
     * The coordinator's configuration.
     *
     * @protected
     * @type {TCoordinatorConfig}
     */
    protected _config: TCoordinatorConfig;
    /**
     * Takes the bundle back with this member's signature in it, to hold while any slot is still empty.
     *
     * @param {string} proposalId - The proposal (transaction index) id.
     * @param {Transaction} proposal - The bundle, carrying every signature collected so far.
     * @returns {Promise<TransactionResult>} The hash and fee of the transaction that eventually carries these approvals, so it resolves late.
     */
    submitProposal(proposalId: string, proposal: Transaction): Promise<TransactionResult>;
    /**
     * Returns the compiled bundle this member should sign, or null to leave it voting alone in its own
     * transaction. The bundle must carry this member's own approval of that proposal.
     *
     * @param {string} proposalId - The proposal (transaction index) id.
     * @returns {Promise<Transaction | null>} The bundle, or null.
     */
    getProposal(proposalId: string): Promise<Transaction | null>;
    /**
     * Puts this member's signature in its slot in the bundle, which
     * `CoordinatorSigner.partiallySignTransaction` does. Throw to refuse.
     *
     * @param {Transaction} proposal - The bundle to sign, carrying every signature collected so far.
     * @returns {Promise<Transaction>} The bundle with this member's signature in it.
     */
    confirmProposal(proposal: Transaction): Promise<Transaction>;
}
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type Transaction = import("@solana/transactions").Transaction;
/**
 * What a coordinator is given of the member it signs for: its address, and a way to add its
 * signature to a compiled transaction.
 */
export type CoordinatorSigner = {
    /**
     * - Returns the member's address.
     */
    getAddress: () => Promise<string>;
    /**
     * - Puts this member's signature in its slot of a compiled transaction, leaving every other slot alone.
     */
    partiallySignTransaction: (tx: Transaction) => Promise<Transaction>;
};
/**
 * Builds the coordinator an account votes through. One configuration is shared by every account a
 * manager derives, and each signs with a different key, so it carries a factory rather than an
 * instance.
 */
export type MultisigCoordinatorFactory = (config: CoordinatorSigner) => IMultisigCoordinator;
