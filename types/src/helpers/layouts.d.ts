/**
 * The discriminators the Squads accounts this package reads lead with.
 *
 * @type {{ multisig: Uint8Array, proposal: Uint8Array, vaultTransaction: Uint8Array, configTransaction: Uint8Array, batch: Uint8Array, programConfig: Uint8Array }}
 */
export const ACCOUNT_DISCRIMINATOR: {
    multisig: Uint8Array;
    proposal: Uint8Array;
    vaultTransaction: Uint8Array;
    configTransaction: Uint8Array;
    batch: Uint8Array;
    programConfig: Uint8Array;
};
/**
 * The statuses a Squads proposal can hold, as the tags of its status enum.
 *
 * @type {{ draft: 0, active: 1, rejected: 2, approved: 3, executing: 4, executed: 5, cancelled: 6 }}
 */
export const PROPOSAL_STATUS: {
    draft: 0;
    active: 1;
    rejected: 2;
    approved: 3;
    executing: 4;
    executed: 5;
    cancelled: 6;
};
/**
 * The configuration actions this package proposes, as the values `CONFIG_ACTION_ENCODER` takes.
 *
 * @type {{ addMember: (address: string, mask: number) => Object, removeMember: (address: string) => Object, changeThreshold: (threshold: number) => Object }}
 */
export const CONFIG_ACTION: {
    addMember: (address: string, mask: number) => any;
    removeMember: (address: string) => any;
    changeThreshold: (threshold: number) => any;
};
/** @type {import('@solana/codecs').Encoder<Object>} */
export const CONFIG_ACTION_ENCODER: import("@solana/codecs").Encoder<any>;
/** @type {import('@solana/codecs').Decoder<Object>} */
export const CONFIG_ACTION_DECODER: import("@solana/codecs").Decoder<any>;
/**
 * The message a `vaultTransactionCreate` carries, in the `SmallVec` form the instruction takes.
 *
 * @type {import('@solana/codecs').Encoder<Object>}
 */
export const TRANSACTION_MESSAGE: import("@solana/codecs").Encoder<any>;
/**
 * The data of the System program transfer a native `propose` wraps.
 *
 * @type {import('@solana/codecs').Encoder<{ lamports: bigint }>}
 */
export const SYSTEM_TRANSFER: import("@solana/codecs").Encoder<{
    lamports: bigint;
}>;
/**
 * The data of each Squads instruction this package submits, keyed by instruction.
 *
 * @type {{ [K in 'multisigCreateV2' | 'vaultTransactionCreate' | 'vaultTransactionExecute' | 'configTransactionCreate' | 'configTransactionExecute' | 'proposalCreate' | 'proposalApprove' | 'proposalReject']: import('@solana/codecs').Encoder<any> }}
 */
export const INSTRUCTION: { [K in "multisigCreateV2" | "vaultTransactionCreate" | "vaultTransactionExecute" | "configTransactionCreate" | "configTransactionExecute" | "proposalCreate" | "proposalApprove" | "proposalReject"]: import("@solana/codecs").Encoder<any>; };
/**
 * The accounts this package reads, keyed by account. `multisigHeader` is the fixed-size prefix of
 * a multisig, for the reads that slice one rather than fetching it whole.
 *
 * @type {{ [K in 'multisig' | 'multisigHeader' | 'proposal' | 'vaultTransaction' | 'configTransaction' | 'programConfig' | 'clock' | 'lookupTableAddresses']: import('@solana/codecs').Decoder<any> }}
 */
export const ACCOUNT: { [K in "multisig" | "multisigHeader" | "proposal" | "vaultTransaction" | "configTransaction" | "programConfig" | "clock" | "lookupTableAddresses"]: import("@solana/codecs").Decoder<any>; };
