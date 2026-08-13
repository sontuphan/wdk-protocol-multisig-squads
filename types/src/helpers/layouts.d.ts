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
 * @type {{ addMember: (address: string, mask: number) => ConfigAction, removeMember: (address: string) => ConfigAction, changeThreshold: (threshold: number) => ConfigAction }}
 */
export const CONFIG_ACTION: {
    addMember: (address: string, mask: number) => ConfigAction;
    removeMember: (address: string) => ConfigAction;
    changeThreshold: (threshold: number) => ConfigAction;
};
/** @type {ConfigActionEncoder} */
export const CONFIG_ACTION_ENCODER: ConfigActionEncoder;
/**
 * The action list a config transaction carries, as the instruction writes it and as the account
 * stores it. Exported for its `getSizeFromValue`, which is what a `ConfigTransaction` account's
 * size is measured with.
 *
 * @type {ConfigActionsEncoder}
 */
export const CONFIG_ACTIONS_ENCODER: ConfigActionsEncoder;
/** @type {AnyDecoder} */
export const CONFIG_ACTION_DECODER: AnyDecoder;
/**
 * The message a `vaultTransactionCreate` carries, in the `SmallVec` form the instruction takes.
 *
 * @type {AnyEncoder}
 */
export const TRANSACTION_MESSAGE: AnyEncoder;
/**
 * The same message as the program stores it, once the instruction's `SmallVec`s have been widened
 * to `Vec`s. Written only to measure the account the program will allocate, never submitted.
 *
 * @type {AnyEncoder}
 */
export const STORED_TRANSACTION_MESSAGE: AnyEncoder;
/**
 * The data of the System program transfer a native `propose` wraps.
 *
 * @type {SystemTransferEncoder}
 */
export const SYSTEM_TRANSFER: SystemTransferEncoder;
/**
 * The data of each Squads instruction this package submits, keyed by instruction.
 *
 * @type {SquadsInstructionEncoders}
 */
export const INSTRUCTION: SquadsInstructionEncoders;
/**
 * The accounts this package reads, keyed by account. `multisigHeader` is the fixed-size prefix of
 * a multisig, for the reads that slice one rather than fetching it whole.
 *
 * @type {SquadsAccountDecoders}
 */
export const ACCOUNT: SquadsAccountDecoders;
export type AnyCodec = import("@solana/codecs").Codec<any>;
export type AnyEncoder = import("@solana/codecs").Encoder<any>;
export type AnyDecoder = import("@solana/codecs").Decoder<any>;
export type FixedSizeAnyDecoder = import("@solana/codecs").FixedSizeDecoder<any>;
export type ConfigActionEncoder = import("@solana/codecs").Encoder<ConfigAction>;
export type ConfigActionsEncoder = import("@solana/codecs").Encoder<ConfigAction[]>;
export type SystemTransferEncoder = import("@solana/codecs").Encoder<{
    lamports: bigint;
}>;
/**
 * A configuration action, as `CONFIG_ACTION_ENCODER` takes it: a `__kind` tag naming the variant
 * and that variant's fields beside it.
 */
export type ConfigAction = {
    __kind: string;
} & Record<string, any>;
export type SquadsInstructionName = "multisigCreateV2" | "vaultTransactionCreate" | "vaultTransactionExecute" | "configTransactionCreate" | "configTransactionExecute" | "proposalCreate" | "proposalApprove" | "proposalReject";
export type SquadsAccountName = "multisig" | "multisigHeader" | "proposal" | "vaultTransaction" | "configTransaction" | "programConfig" | "clock" | "lookupTableAddresses";
export type SquadsInstructionEncoders = { [K in SquadsInstructionName]: AnyEncoder; };
export type SquadsAccountDecoders = { [K in SquadsAccountName]: AnyDecoder; } & {
    multisigHeader: FixedSizeAnyDecoder;
};
