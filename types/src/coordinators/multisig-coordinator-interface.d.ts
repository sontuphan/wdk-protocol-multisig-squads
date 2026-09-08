/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@solana/transactions').Transaction} Transaction */
/**
 * What a coordinator is given of the member it signs for: the address to name it by and a way to
 * add its signature to a transaction. Deliberately not the member's account, which would hand over
 * the key as well, and deliberately partial: a coordinator collects signatures, so it must be able
 * to add one without disturbing the others or compiling anything.
 *
 * These two are the whole of what a member contributes to a batch. The bundle is the coordinator's:
 * it decides who signs, builds their approvals, fixes the fee payer and the lifetime, and compiles.
 * A member only fills its own slot.
 *
 * @typedef {Object} CoordinatorSigner
 * @property {() => Promise<string>} getAddress - Returns the member's address.
 * @property {(tx: Transaction) => Promise<Transaction>} partiallySignTransaction - Adds this member's signature to a compiled transaction and changes nothing else, so signatures collected from several members merge in any order. The key itself stays in the account.
 */
/**
 * A proposal's approvals as a coordinator holds them: one compiled transaction, and nothing beside
 * it.
 *
 * Compiled is the point. A signature covers the message bytes, so the bytes have to exist before
 * anyone can sign and must not change afterwards: the approvers, the fee payer and the lifetime are
 * all fixed when the coordinator compiles, and a member that is not a signer of those bytes has no
 * slot and cannot be added to one later. That is why a coordinator has to know who will sign before
 * it builds, and why a durable nonce rather than a blockhash is what keeps the bytes valid across a
 * collection window longer than 60 to 90 seconds.
 *
 * Nothing travels alongside it because nothing needs to. A compiled instruction names its program
 * by an index into the message's static accounts and leads with the same eight-byte discriminator
 * an uncompiled one does, and a signer can never come from an address lookup table, so every
 * approving member is a static account too. The account reads the approvals it carries, which
 * member each belongs to, and whether an execution rides along, out of the bytes themselves.
 *
 */
/**
 * Builds the coordinator an account votes through, from a signer over the member's own key. One
 * configuration is shared by every account a manager derives, and each of those signs with a
 * different key, so the configuration carries this rather than a coordinator instance.
 *
 * @typedef {(config: CoordinatorSigner) => IMultisigCoordinator} MultisigCoordinatorFactory
 */
/**
 * Coordinator for collecting a proposal's approvals into one transaction, which is what turns the
 * N+2 transactions a Squads proposal costs into three.
 *
 * Creating a proposal, rejecting it and executing it are each one member's own transaction and
 * never reach a coordinator. Approvals do, and a coordinator owns them end to end: it decides which
 * members will approve, builds all of their approval instructions and the execution if one rides
 * along, fixes the fee payer and the lifetime, and compiles. `getProposal` hands that transaction
 * to a member, `confirmProposal` puts the member's signature in its slot, and `submitProposal`
 * keeps it while slots are still empty. The member that fills the last one broadcasts, so a
 * coordinator signs and holds and never reaches the cluster itself.
 *
 * What travels is a compiled transaction, which is what makes the signatures collectable: they
 * cover the message bytes, so the bytes must exist before the first signature and must not change
 * after it. An account never appends to a bundle, never counts what is in one, and never rebuilds
 * one: any of those would void every signature already gathered.
 *
 * `submitProposal` resolves late, with the hash and fee of the transaction that eventually carries
 * the approvals it was given, which is what keeps the account's non-nullable `hash` honest.
 *
 * It has no proposal storage and no quoting: approvals are on-chain instructions, so the read-only
 * account reads them from the cluster. Nor does it own an identity: the account votes as the member
 * it derived.
 *
 * Implementations extend this class, which holds the configuration and leaves every method to
 * them. The configuration is the member's signer, widened by whatever else an implementation needs:
 * a service URL, a transport, a key of its own.
 *
 * @template {CoordinatorSigner} [TCoordinatorConfig=CoordinatorSigner]
 */
export class IMultisigCoordinator<TCoordinatorConfig extends CoordinatorSigner = CoordinatorSigner> {
    /**
     * Creates a coordinator over its configuration.
     *
     * @param {TCoordinatorConfig} config - The member's signer, widened by whatever else the implementation needs.
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
     * Takes the bundle back with this member's signature in it, to keep circulating while any slot is
     * still empty. Circulating is all it does: reaching the cluster is the account's job.
     *
     * @param {string} proposalId - The proposal (transaction index) id.
     * @param {Transaction} proposal - The bundle as this member left it, carrying every signature collected so far.
     * @returns {Promise<TransactionResult>} The signature and fee of the transaction that eventually carries these approvals, which is why it resolves late.
     */
    submitProposal(proposalId: string, proposal: Transaction): Promise<TransactionResult>;
    /**
     * Returns the compiled bundle being circulated for a proposal, so this member can sign its slot
     * in it rather than opening a transaction of its own.
     *
     * It must carry this member's own `proposalApprove` for this proposal: the account reads the
     * approvals out of the bytes and refuses to sign a bundle it is not one of, since a signature
     * covers the whole transaction and there is no narrowing it.
     *
     * Null is the answer whenever this member has no bundle to sign: none was built for that
     * proposal, this member is not one of its approvers, or the bundle it was in can no longer land.
     * The account then votes exactly as it would with no coordinator configured, in its own
     * transaction, so a coordinator that declines is never worse than not having one.
     *
     * @param {string} proposalId - The proposal (transaction index) id.
     * @returns {Promise<Transaction | null>} The compiled bundle, or null to leave this member to vote alone.
     */
    getProposal(proposalId: string): Promise<Transaction | null>;
    /**
     * Puts this member's signature in its slot in the bundle. Signing is all it does: the account
     * decides whether the result keeps circulating or goes to the cluster.
     *
     * The bundle is compiled, so there are bytes to sign and this is real signing, over the whole
     * message rather than over one instruction. `CoordinatorSigner.partiallySignTransaction` does
     * exactly it and disturbs no other slot, so signatures merge in any order and signing twice is
     * idempotent. An implementation that will not sign refuses by throwing, which reaches the caller
     * of `approveProposal` unchanged; `ValueError`, which this package re-exports, is what the
     * account itself raises when it turns a vote down.
     *
     * @param {Transaction} proposal - The bundle to sign, carrying every signature collected so far.
     * @returns {Promise<Transaction>} The bundle with this member's signature in it.
     */
    confirmProposal(proposal: Transaction): Promise<Transaction>;
}
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type Transaction = import("@solana/transactions").Transaction;
/**
 * What a coordinator is given of the member it signs for: the address to name it by and a way to
 * add its signature to a transaction. Deliberately not the member's account, which would hand over
 * the key as well, and deliberately partial: a coordinator collects signatures, so it must be able
 * to add one without disturbing the others or compiling anything.
 *
 * These two are the whole of what a member contributes to a batch. The bundle is the coordinator's:
 * it decides who signs, builds their approvals, fixes the fee payer and the lifetime, and compiles.
 * A member only fills its own slot.
 */
export type CoordinatorSigner = {
    /**
     * - Returns the member's address.
     */
    getAddress: () => Promise<string>;
    /**
     * - Adds this member's signature to a compiled transaction and changes nothing else, so signatures collected from several members merge in any order. The key itself stays in the account.
     */
    partiallySignTransaction: (tx: Transaction) => Promise<Transaction>;
};
/**
 * Builds the coordinator an account votes through, from a signer over the member's own key. One
 * configuration is shared by every account a manager derives, and each of those signs with a
 * different key, so the configuration carries this rather than a coordinator instance.
 */
export type MultisigCoordinatorFactory = (config: CoordinatorSigner) => IMultisigCoordinator;
