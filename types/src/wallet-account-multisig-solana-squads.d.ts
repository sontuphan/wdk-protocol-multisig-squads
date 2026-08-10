/**
 * Solana Squads multisig wallet account with signing capabilities.
 * Provides full transaction and message signing operations.
 *
 * @implements {IWalletAccountMultisig}
 * @implements {IMultisigOwnerManagement}
 */
export default class WalletAccountMultisigSolanaSquads extends WalletAccountReadOnlyMultisigSolanaSquads implements IWalletAccountMultisig, IMultisigOwnerManagement {
    /**
     * Creates a new Solana Squads multisig wallet account.
     *
     * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
     * @param {string} path - The SLIP-0010 derivation path (e.g. "0'/0'").
     * @param {SolanaMultisigSquadsConfig} config - The configuration object.
     */
    constructor(seed: string | Uint8Array, path: string, config: SolanaMultisigSquadsConfig);
    /**
     * The underlying Solana signer account.
     *
     * @protected
     * @type {WalletAccountSolana}
     */
    protected _signerAccount: WalletAccountSolana;
    /**
     * The derivation path's index of this account.
     *
     * @type {number}
     */
    get index(): number;
    /**
     * The derivation path of this account (see [SLIP-0010](https://slips.readthedocs.io/en/latest/slip-0010/)).
     *
     * @type {string}
     */
    get path(): string;
    /**
     * The key pair of the signer account.
     *
     * @type {import('@tetherto/wdk-wallet').KeyPair}
     */
    get keyPair(): import("@tetherto/wdk-wallet").KeyPair;
    /**
     * Returns the address of the signer this account votes and proposes as.
     *
     * This is **not** {@link getAddress}, which returns the multisig's own address: the signer
     * is one of the multisig's members, and every signature this account produces is theirs.
     *
     * @returns {Promise<string>} The signer's address.
     */
    getSignerAddress(): Promise<string>;
    /**
     * Signs a message with the signer account.
     *
     * @param {string | Uint8Array} message - The message to sign.
     * @returns {Promise<string>} The signature.
     */
    sign(message: string | Uint8Array): Promise<string>;
    /**
     * Proposes a message to be signed by the multisig members.
     *
     * **Not supported, and not pending work.** Squads has no message-signing primitive,
     * and a multisig cannot produce a signature: its accounts are program-derived
     * addresses with no private key. Members can approve a message on-chain by wrapping
     * it in a vault transaction, but that yields proof of approval rather than a
     * signature — and the resulting proposal is addressed by transaction index, not by
     * message hash, so {@link approveMessageProposal} could not find it again.
     *
     * Use {@link sign} to sign a message with this account's own signer key, which proves
     * one member's consent rather than the multisig's.
     *
     * @param {string | Uint8Array} message - The message to propose.
     * @returns {Promise<MultisigMessageProposal & MultisigSignature>} The message proposal.
     * @throws {NotSupportedError} Always, for the reasons above.
     */
    proposeMessage(message: string | Uint8Array): Promise<MultisigMessageProposal & MultisigSignature>;
    /**
     * Approves a pending message proposal.
     *
     * **Not supported, and not pending work.** See {@link proposeMessage}: Squads has no
     * message-signing primitive, and a message hash cannot be resolved to a Squads
     * account, which are keyed by sequential transaction index.
     *
     * @param {string} messageId - The hash of the proposed message.
     * @returns {Promise<MultisigMessageProposal & MultisigSignature>} The updated message proposal.
     * @throws {NotSupportedError} Always, for the reasons above.
     */
    approveMessageProposal(messageId: string): Promise<MultisigMessageProposal & MultisigSignature>;
    /**
     * Validates that the signer is a member of the multisig.
     *
     * Checks membership only — not the permission a given operation requires.
     *
     * @returns {Promise<void>}
     * @throws {Error} If the multisig does not exist, or the signer is not one of its members.
     */
    validateSignerIsOwner(): Promise<void>;
    /**
     * Deploys (creates) the multisig account on-chain.
     *
     * Requires `createKeySecret` in the configuration: the multisig's address derives from
     * that key, so **retain it** — losing it makes the address, and any funds in its vault,
     * unrecoverable.
     *
     * Owners default to this account's signer alone with a threshold of 1, creating a
     * single-member multisig that {@link addOwner} can grow. Every owner is created with
     * full permissions.
     *
     * @param {string[]} [owners] - The member addresses. Defaults to this account's signer.
     * @param {number} [threshold=1] - The approvals a proposal needs.
     * @returns {Promise<{ hash: string }>} The creation transaction's signature.
     * @throws {Error} If `createKeySecret` is missing, the owners or threshold are invalid,
     *   the multisig already exists, or the quoted fee exceeds `createMaxFee`.
     */
    deploy(owners?: string[], threshold?: number): Promise<{
        hash: string;
    }>;
    /**
     * Proposes a transaction to the multisig.
     *
     * The proposal is created open for voting, with no approvals of its own — creating a
     * proposal is not a vote, so `confirmations` is 0 even for the proposer.
     *
     * The proposal takes the multisig's next transaction index. If another member proposes
     * first, that index is taken and this call fails; the error is surfaced rather than
     * retried, because retrying would sign and send a second transaction.
     *
     * Setting `autoExecute` approves and executes the proposal in the same transaction, but
     * only where that can work: a threshold of 1, no time lock, and a signer holding all three
     * permissions. Where it cannot, the flag is ignored and the result is an ordinary proposal
     * — read `status` rather than assuming it applied.
     *
     * @param {SolanaTransaction} tx - The transaction to propose.
     * @param {MultisigTransactionOptions} [transactionOptions] - The multisig transaction's options.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result.
     * @throws {Error} If the multisig does not exist, the signer cannot propose, or the RPC
     *   request fails.
     * @todo Support transaction messages beyond a native transfer.
     */
    propose(tx: SolanaTransaction, transactionOptions?: MultisigTransactionOptions): Promise<SolanaMultisigProposalResult>;
    /**
     * Proposes an SPL token transfer to the multisig.
     *
     * Native SOL transfers go through {@link propose} instead. Token-2022 mints are
     * refused rather than transferred to an address this package cannot derive.
     *
     * Creating the recipient's token account, when it has none, is paid for by the vault at
     * execution rather than by the proposer — so a vault holding enough tokens but too little
     * SOL will propose and collect approvals, then fail to execute.
     *
     * Setting `autoExecute` approves and executes the proposal in the same transaction where
     * that can work — see {@link propose}. A transfer that would fail at execution then
     * fails outright, leaving no proposal behind rather than an unexecutable one.
     *
     * @param {TransferOptions} transferOptions - The transfer options.
     * @param {MultisigTransactionOptions} [transactionOptions] - The multisig transaction's options.
     * @returns {Promise<SolanaMultisigProposalResult>} The transfer proposal result.
     * @throws {Error} If the mint or recipient is malformed, the mint does not exist, the
     *   signer cannot propose, or the quote exceeds `transferMaxFee`.
     * @throws {NotSupportedError} If the mint belongs to the Token-2022 program.
     * @todo Support Token-2022 (Token Extensions Program).
     */
    transfer(transferOptions: TransferOptions, transactionOptions?: MultisigTransactionOptions): Promise<SolanaMultisigProposalResult>;
    /**
     * Approves a pending transaction proposal.
     *
     * A previous rejection does not block an approval: Squads withdraws the rejection, so a
     * member can change their vote. Approving twice is refused.
     *
     * The returned `confirmations` reaching the threshold means the proposal has just become
     * approved, not that it ran — Squads cannot execute on another member's approval, so
     * `status` is always `'pending'` and `transaction` is never set. Execution is a separate
     * step, via {@link executeProposal}.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @param {string} [memo] - An optional note recorded on chain with the vote. It costs
     *   rent, and an empty string is stored as a present-but-empty memo rather than none.
     * @returns {Promise<SolanaMultisigProposalResult>} The approval result.
     * @throws {NoSuchElementError} If no proposal exists at that id.
     * @throws {Error} If the id is invalid, the multisig does not exist, the signer cannot
     *   vote, the proposal is not open for voting, the signer has already approved it, or the
     *   RPC request fails.
     */
    approveProposal(proposalId: number | bigint | string, memo?: string): Promise<SolanaMultisigProposalResult>;
    /**
     * Rejects a pending transaction proposal.
     *
     * A previous approval does not block a rejection: Squads withdraws the approval, so a
     * member can change their vote. Rejecting twice is refused.
     *
     * Note the returned `confirmations` counts approvals, so it **decreases** when the signer
     * had previously approved.
     *
     * Squads ends a proposal once enough members have rejected that the threshold can no longer
     * be reached, which in a multisig requiring unanimity is a single rejection. This does not
     * report whether that happened — a rejected proposal is still `'pending'`, since it has
     * not executed. Use {@link getProposal} for the resulting `statusName`.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @param {string} [memo] - An optional note recorded on chain with the vote. It costs
     *   rent, and an empty string is stored as a present-but-empty memo rather than none.
     * @returns {Promise<SolanaMultisigProposalResult>} The rejection result.
     * @throws {NoSuchElementError} If no proposal exists at that id.
     * @throws {Error} If the id is invalid, the multisig does not exist, the signer cannot
     *   vote, the proposal is not open for voting, the signer has already rejected it, or the
     *   RPC request fails.
     */
    rejectProposal(proposalId: number | bigint | string, memo?: string): Promise<SolanaMultisigProposalResult>;
    /**
     * Submits an approved proposal for on-chain execution.
     *
     * The wrapped instructions run by CPI inside this one transaction, so a resolved result
     * means all of them succeeded — there is no partial execution.
     *
     * Note this returns `{ hash, fee }` rather than the proposal-shaped result the propose and
     * vote methods return, matching the interface.
     *
     * Rent is not reclaimed: the transaction and proposal accounts survive execution and keep
     * holding what {@link quotePropose} quoted.
     *
     * @param {number | bigint | string} proposalId - The proposal (transaction index) id.
     * @returns {Promise<TransactionResult>} The execution transaction's result.
     * @throws {NoSuchElementError} If no proposal exists at that id.
     * @throws {ValueError} If the proposal has not reached the approval threshold.
     * @throws {Error} If the id is invalid, the multisig does not exist, the signer cannot
     *   execute, its time lock has not elapsed, a config proposal has been invalidated, or the
     *   RPC request fails.
     * @throws {NotImplementedError} If the proposal backs a batch. Batches are a deliberate
     *   scope decision rather than pending work: a batch executes one inner transaction per
     *   call, so it does not fit a method whose result is a single transaction.
     */
    executeProposal(proposalId: number | bigint | string): Promise<TransactionResult>;
    /**
     * Proposes adding a new member to the multisig.
     *
     * **This does not add the member.** It creates a proposal; the member set changes only once
     * enough owners approve it and one of them calls {@link executeProposal}.
     *
     * The new member is given full permissions, matching {@link deploy}. Pass
     * `options.threshold` to change the approval threshold in the same proposal — doing it as a
     * second proposal cannot work, because executing either one invalidates the other.
     *
     * Note two further effects of executing the resulting proposal: every other pending proposal
     * is invalidated, including ones created after this one, except vault proposals already
     * approved; and the multisig account is enlarged in ten-member steps, so roughly every tenth
     * addition costs its executor about 0.0023 SOL more than the others.
     *
     * @param {string} ownerAddress - The address of the member to add.
     * @param {MultisigOptions} [options] - The operation options.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result.
     * @throws {Error} If the address is malformed or already a member, the threshold is out of
     *   range, the multisig does not exist or is controlled by a configuration authority, the
     *   signer cannot propose, or the RPC request fails.
     * @todo Let the caller choose the new member's permissions.
     */
    addOwner(ownerAddress: string, options?: MultisigOptions): Promise<SolanaMultisigProposalResult>;
    /**
     * Proposes removing a member from the multisig.
     *
     * **This does not remove the member.** It creates a proposal; the member set changes only
     * once enough owners approve it and one of them calls {@link executeProposal}.
     *
     * A multisig whose threshold equals its number of voting members — the majority of them —
     * cannot remove a voter without lowering the threshold too, since the result would need more
     * approvals than it has voters. Pass `options.threshold` to do both in the one proposal; the
     * error says which value is needed.
     *
     * Members can propose their own removal. Executing the resulting proposal invalidates every
     * other pending proposal, as {@link addOwner} describes.
     *
     * Note the multisig account never shrinks, so nothing is refunded, and removal does **not**
     * revoke any spending limit the member was listed on.
     *
     * @param {string} ownerAddress - The address of the member to remove.
     * @param {MultisigOptions} [options] - The operation options.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result.
     * @throws {Error} If the address is malformed or not a member, the removal would leave the
     *   multisig with no members or nobody able to vote, propose or execute, the threshold would
     *   exceed the remaining voters, the multisig does not exist or is controlled by a
     *   configuration authority, the signer cannot propose, or the RPC request fails.
     */
    removeOwner(ownerAddress: string, options?: MultisigOptions): Promise<SolanaMultisigProposalResult>;
    /**
     * Proposes swapping one member for another.
     *
     * **This does not swap the member.** It creates a proposal; the member set changes only once
     * enough owners approve it and one of them calls {@link executeProposal}.
     *
     * The replacement **inherits the permissions of the member it replaces**, so the swap leaves
     * the multisig's voting power unchanged. This differs from {@link addOwner}, which grants
     * full permissions.
     *
     * Squads has no swap instruction: this is a removal and an addition applied together. Doing
     * them as two proposals instead is not equivalent — removing first can be refused outright
     * when the departing member is the only voter, and adding first only works if the removal is
     * proposed after the addition has executed.
     *
     * @param {string} oldOwnerAddress - The address of the member to replace.
     * @param {string} newOwnerAddress - The address of the new member.
     * @param {MultisigOptions} [options] - The operation options.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result.
     * @throws {Error} If either address is malformed, they are equal, the old address is not a
     *   member, the new one already is, the threshold would exceed the resulting voters, the
     *   multisig does not exist or is controlled by a configuration authority, the signer cannot
     *   propose, or the RPC request fails.
     */
    swapOwner(oldOwnerAddress: string, newOwnerAddress: string, options?: MultisigOptions): Promise<SolanaMultisigProposalResult>;
    /**
     * Proposes changing the approval threshold of the multisig.
     *
     * **This does not change the threshold.** It creates a proposal; the threshold changes only
     * once enough owners approve it and one of them calls {@link executeProposal}.
     *
     * The ceiling is the number of owners able to **vote**, not the number of owners — read
     * `masks` from {@link getMultisigInfo} to count them.
     *
     * Setting the threshold to the value it already holds is refused: it would change nothing
     * yet still cost a full approval round and invalidate every other pending proposal.
     *
     * Note that raising the threshold to the voter count is a larger change than it looks. It
     * makes a single rejection enough to end any proposal, and means removing any voter
     * afterwards requires lowering the threshold in the same operation.
     *
     * @param {number} newThreshold - The new threshold.
     * @returns {Promise<SolanaMultisigProposalResult>} The proposal result.
     * @throws {Error} If the threshold is not an integer between 1 and the number of owners able
     *   to vote, is the threshold already in force, the multisig does not exist or is controlled
     *   by a configuration authority, the signer cannot propose, or the RPC request fails.
     */
    changeThreshold(newThreshold: number): Promise<SolanaMultisigProposalResult>;
    /**
     * Returns a read-only view of this account.
     *
     * The view carries the multisig address this account has resolved, rather than only
     * what the configuration named: an account configured with a `createKeySecret` alone
     * knows its address once {@link getAddress} or {@link deploy} has run, and the secret
     * itself is withheld from a view that cannot sign with it.
     *
     * @returns {WalletAccountReadOnlyMultisigSolanaSquads} The read-only account.
     */
    toReadOnlyAccount(): WalletAccountReadOnlyMultisigSolanaSquads;
    /**
     * Clears the signer's private key material from memory.
     *
     * @returns {void}
     */
    dispose(): void;
    /** @private */
    private _getCreateKeySigner;
    /** @private */
    private _validateOwners;
    /**
     * Proposes a vault transaction carrying the given message, opening it for voting.
     *
     * @private
     */
    private _proposeVaultTransaction;
    /** @private */
    private _requireDeployed;
    /**
     * Proposes a transaction from a creating instruction's data, opening it for voting.
     *
     * The vault and config paths differ only in that data — the account list, the index
     * arithmetic and the accompanying `proposalCreate` are identical.
     *
     * @private
     */
    private _proposeTransaction;
    /**
     * Decides whether this signer's proposal can be approved and executed in the same
     * transaction, and builds those two instructions when it can.
     *
     * Returns nothing when the flag cannot apply — it is a request, not an assertion.
     *
     * @private
     */
    private _buildAutoExecuteInstructions;
    /**
     * Whether a proposal this signer creates would be executable in the same transaction.
     *
     * The threshold must be 1, since a fresh proposal carries one vote. The time lock must be
     * zero, because the approval's timestamp is the current instant — any positive lock fails
     * by construction rather than by timing. And the signer needs to vote and execute, not
     * merely propose.
     *
     * @private
     */
    private _canAutoExecute;
    /** @private */
    private _encodeTransactionMessage;
    /**
     * Compiles instructions into the message Squads takes as an instruction argument.
     *
     * Note this is not the message the program then stores: the argument uses one-byte
     * length prefixes where the stored account uses four-byte ones.
     *
     * Returns the account keys and header counts alongside the bytes, because auto-execution
     * has to resolve the message's accounts before the transaction account exists to be read
     * back.
     *
     * @private
     */
    private _compileTransactionMessage;
    /** @private */
    private _requirePermission;
    /**
     * Validates everything Squads requires of a vote, and returns the signer's address.
     *
     * The program applies the same four conditions to approvals and rejections, so both share
     * this. Note staleness always blocks a vote, unlike execution.
     *
     * @private
     */
    private _requireVotableProposal;
    /**
     * Builds a `proposalApprove` or `proposalReject` instruction.
     *
     * Kept separate from the methods that send it so a future `autoExecute` can pack a vote
     * and an execution into one transaction.
     *
     * @private
     */
    private _buildProposalVoteInstruction;
    /**
     * Builds a `configTransactionExecute` instruction.
     *
     * Spending-limit actions name an account the program looks for among the remaining
     * accounts — one to create, one to close — so those are resolved and appended.
     *
     * @private
     */
    private _buildConfigExecuteInstruction;
    /**
     * Resolves the spending limit accounts a config transaction's actions refer to.
     *
     * `AddSpendingLimit` names a create key the account is derived from; `RemoveSpendingLimit`
     * names the account outright. The program finds each by key rather than by position, so
     * order does not matter — only that every one is present and writable.
     *
     * @private
     */
    private _resolveSpendingLimitAccounts;
    /** @private */
    private _buildVaultExecuteInstruction;
    /**
     * Builds the `remaining_accounts` the program expects for a vault transaction.
     *
     * Three groups in a fixed order: the lookup table accounts, the message's own keys with
     * the flags the message asked for, then the addresses those lookups resolve to.
     *
     * The vault and any ephemeral signers are de-signed: the message marks them as signers, but
     * they are program-derived addresses that the program signs for at execution, so the outer
     * transaction must not ask them for a signature it cannot produce.
     *
     * @private
     */
    private _resolveExecutionAccounts;
    /** @private */
    private _getLookupTableAddresses;
    /** @private */
    private _isStaticWritableIndex;
    /** @private */
    private _toAccountRole;
    /** @private */
    private _encodeProposalVoteData;
    /** @private */
    private _requireAutonomous;
    /** @private */
    private _validateThreshold;
    /**
     * Checks the signer may propose, ahead of anything about what is being proposed.
     *
     * The program validates the creator before it looks at the actions, so a signer who cannot
     * propose at all should hear that rather than a complaint about their proposal's contents.
     *
     * @private
     */
    private _requireCanPropose;
    /** @private */
    private _countVoters;
    /**
     * Validates the member set a configuration change would leave behind.
     *
     * These are the rules the program checks in `invariant()` — after applying every action, so
     * a proposal breaking one is only refused at execution, once its rent is spent and the votes
     * are cast. Every one is decidable from the member list already in hand.
     *
     * @private
     */
    private _requireViableMembers;
    /** @private */
    private _encodeRemoveMemberAction;
    /** @private */
    private _encodeAddMemberAction;
    /** @private */
    private _encodeChangeThresholdAction;
    /** @private */
    private _encodeConfigTransactionCreateData;
    /** @private */
    private _encodeVaultTransactionCreateData;
    /** @private */
    private _encodeProposalCreateData;
    /** @private */
    private _encodeMultisigCreateV2Data;
}
export type IWalletAccountMultisig = import("@tetherto/wdk-wallet/multisig").IWalletAccountMultisig;
export type IMultisigOwnerManagement = import("@tetherto/wdk-wallet/multisig").IMultisigOwnerManagement;
export type MultisigAutoExecuteResult = import("@tetherto/wdk-wallet/multisig").MultisigAutoExecuteResult;
export type MultisigProposal = import("@tetherto/wdk-wallet/multisig").MultisigProposal;
/**
 * `MultisigProposal` widened with the signature and fee of the transaction that carried the
 * call. The interface's `transaction` reports an auto-execution and is absent without one,
 * so `hash` is the only handle on a proposal or a vote that did not execute.
 */
export type SolanaMultisigProposalResult = MultisigProposal & MultisigAutoExecuteResult & {
    hash: string;
    fee: bigint;
};
export type MultisigTransactionOptions = import("@tetherto/wdk-wallet/multisig").MultisigTransactionOptions;
export type MultisigOptions = import("@tetherto/wdk-wallet/multisig").MultisigOptions;
export type MultisigMessageProposal = import("@tetherto/wdk-wallet/multisig").MultisigMessageProposal;
export type MultisigSignature = import("@tetherto/wdk-wallet/multisig").MultisigSignature;
export type TransactionResult = import("@tetherto/wdk-wallet").TransactionResult;
export type TransferOptions = import("@tetherto/wdk-wallet").TransferOptions;
export type SolanaTransaction = import("@tetherto/wdk-wallet-solana").SolanaTransaction;
export type SolanaMultisigSquadsConfig = import("./wallet-account-read-only-multisig-solana-squads.js").SolanaMultisigSquadsConfig;
import WalletAccountReadOnlyMultisigSolanaSquads from './wallet-account-read-only-multisig-solana-squads.js';
import { WalletAccountSolana } from '@tetherto/wdk-wallet-solana';
