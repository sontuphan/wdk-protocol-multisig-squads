# Squads fixtures

The two files here are the Squads v4 deployment, copied from **Solana mainnet-beta** and
checked into the repository. They are what `solana-test-validator` loads into genesis, so
the integration tests run against the audited bytecode Squads actually deployed rather
than a local rebuild of it.

| File | Account | Role |
|---|---|---|
| `squads-program.so` | `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf` | The Squads v4 program |
| `squads-program-config.json` | `BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr` | The `ProgramConfig` PDA, holding the treasury every `multisigCreateV2` pays into |

The program address is the one published in the [Squads v4
docs](https://docs.squads.so/main/development/introduction/what-is-squads-protocol.md) and
in the `@sqds/multisig` SDK. The config address was not looked up anywhere — it is the PDA
of seeds `["multisig", "program_config"]` under that program. It is pinned as a constant in
[`../module.test.js`](../module.test.js) rather than derived at run time, and a test there
asserts the loaded account exists and is owned by the Squads program.

To re-derive it yourself:

```js
await getProgramDerivedAddress({
  programAddress: 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf',
  seeds: ['multisig', 'program_config']
})
```

Being checked in is the point: the localnet needs no network, no clone step, and no
download script, and the bytecode under test does not change under you between runs.

## Reproducing them

Both files are exactly what the Solana CLI writes — no post-processing, so the commands
below overwrite them byte for byte:

```sh
solana program dump SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf \
  tests/integration/fixtures/squads-program.so -u m

solana account BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr \
  -u m --output json --output-file tests/integration/fixtures/squads-program-config.json
```

To verify a checkout against mainnet without replacing anything, dump to a scratch path
and compare:

```sh
solana program dump SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf /tmp/squads.so -u m
shasum -a 256 /tmp/squads.so tests/integration/fixtures/squads-program.so
```

Current program: `dec8d3e0fae58c7c8f2416e5f67c25e673f047afd6dd2bba4a47e0b29a01d34c`.

Refresh them only deliberately — a Squads upgrade changes what the tests exercise, and
the diff should be reviewed as such rather than landing as a routine update.
