/**
 * Builds the transport an account votes and proposes through, from the member's own signer
 * account. One configuration is shared by every account a manager derives, and each of those
 * signs with a different key, so the configuration carries this rather than a transport instance.
 */
export type SquadsTransactionTransportFactory = (signerAccount: import("@tetherto/wdk-wallet-solana").WalletAccountSolana) => ISquadsTransactionTransport;
/**
 * Transport for getting a Squads transaction signed and broadcast.
 *
 * The account builds unsigned Solana instructions and hands them here; the transport owns
 * everything from that point: which signatures the transaction needs, how they are collected, and
 * when it reaches the cluster. The default, `LocalSignerTransport`, signs with the local member
 * key and broadcasts at once, which is what the package did before transports existed. A
 * peer-to-peer implementation would instead distribute the transaction to the other members and
 * broadcast once enough of them have signed, resolving late rather than returning early: the
 * account's public results carry a non-nullable `hash`.
 *
 * Squads keeps its votes on chain, one transaction per vote, so this contract is about reaching
 * the cluster and nothing else. It deliberately has no proposal storage, no message sharing and no
 * quoting: proposals and votes are read from the chain by the read-only account, and the fee a
 * transaction paid comes back from `sendTransaction`. Nor does it own an identity: the account
 * votes as the member it derived, and `getSignerAddress()` answers from that account, so the two
 * can never disagree.
 *
 * A transport disposes what it created. The signer account it is given is owned by the caller,
 * which zeroes that key itself.
 */
export interface ISquadsTransactionTransport {
    /**
     * Signs a transaction and broadcasts it, resolving once it has reached the cluster.
     *
     * @param {SolanaTransaction} tx - The unsigned transaction. Its instructions may carry embedded signers, which the transport must honour.
     * @returns {Promise<TransactionResult>} The transaction's signature and the fee it paid.
     * @throws {NotImplementedError} An implementation must provide this method.
     */
    sendTransaction(tx: import("@tetherto/wdk-wallet-solana").SolanaTransaction): Promise<import("@tetherto/wdk-wallet").TransactionResult>;
    /**
     * Releases the transport's resources, erasing any key material it created.
     *
     * @returns {void}
     * @throws {NotImplementedError} An implementation must provide this method.
     */
    dispose(): void;
}
