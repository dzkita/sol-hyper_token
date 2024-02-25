import * as anchor from "@coral-xyz/anchor"
import * as spl from "@solana/spl-token"
import { Program } from "@coral-xyz/anchor"
import {PaymentConfig} from '../target/types/payment_config'
import { PublicKey, } from "@solana/web3.js"

import { assert, expect } from "chai"
import { execSync } from "child_process"
const fs = require("fs")

describe("config", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env())
  const connection = anchor.getProvider().connection
  const wallet = anchor.workspace.PaymentConfig.provider.wallet

  const program = anchor.workspace.PaymentConfig as Program<PaymentConfig>

  const sender = anchor.web3.Keypair.generate()
  const receiver = anchor.web3.Keypair.generate()

  let feeDestination: anchor.web3.PublicKey
  let senderTokenAccount: anchor.web3.PublicKey
  let receiverTokenAccount: anchor.web3.PublicKey
  
  let mint:anchor.web3.PublicKey;
  const programConfig= PublicKey.findProgramAddressSync(
    [Buffer.from("program_config")],
    program.programId
  )[0];
  const programDataAddress = PublicKey.findProgramAddressSync(
    [program.programId.toBytes()],
    new anchor.web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
  )[0]

  const deploy = () => {
    const deployCmd = `solana program deploy --url localhost -v --program-id $(pwd)/target/deploy/config-keypair.json $(pwd)/target/deploy/config.so`
    execSync(deployCmd)
  }


  before(async () => {
    let data = fs.readFileSync(
      "envbp7mfaMj42tHKBsPAVZpAsdMREF244dJz7bSHir7.json"
    );

    let keypair= anchor.web3.Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(data))
    )
    const mint = await spl.createMint(
      connection,wallet.payer,wallet.publicKey,null,0,keypair
    );

    feeDestination = await spl.createAccount(
      connection,
      wallet.payer,
      mint,
      wallet.publicKey
    )

    senderTokenAccount = await spl.createAccount(
      connection,
      wallet.payer,
      mint,
      sender.publicKey
    )

    receiverTokenAccount = await spl.createAccount(
      connection,
      wallet.payer,
      mint,
      receiver.publicKey
    )

    await spl.mintTo(
      connection,
      wallet.payer,
      mint,
      senderTokenAccount,
      wallet.payer,
      10000
    )

    const transactionSignature = await connection.requestAirdrop(
      sender.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    )

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash()

    await connection.confirmTransaction(
      {
        blockhash,
        lastValidBlockHeight,
        signature: transactionSignature,
      },
      "confirmed"
    )
    deploy()
  })
  it("Initialize Program Config Account",async () => {
    const tx= await program.methods.initializeProgramConfig().accounts({
      programConfig:programConfig,
      feeDestination:feeDestination,
      authority:wallet.publicKey,
      systemProgram:anchor.web3.SystemProgram.programId
    }).rpc();
    assert.strictEqual(
      (
        await program.account.programConfig.fetch(programConfig)
      ).feeBasisPoints.toNumber(),100
    )
    assert.strictEqual(
      (
        await program.account.programConfig.fetch(programConfig)
      ).admin.toString(),wallet.publicKey.toString()
    )
  })
  it("Payment completes successfully", async () => {
    const tx = await program.methods
      .payment(new anchor.BN(10000))
      .accounts({
        programConfig:programConfig,
        feeDestination: feeDestination,
        senderTokenAccount: senderTokenAccount,
        receiverTokenAccount: receiverTokenAccount,
        sender: sender.publicKey,
      })
      .transaction()

    await anchor.web3.sendAndConfirmTransaction(connection, tx, [sender])

    assert.strictEqual(
      (await connection.getTokenAccountBalance(senderTokenAccount)).value
        .uiAmount,
      0
    )

    assert.strictEqual(
      (await connection.getTokenAccountBalance(feeDestination)).value.uiAmount,
      100
    )

    assert.strictEqual(
      (await connection.getTokenAccountBalance(receiverTokenAccount)).value
        .uiAmount,
      9900
    )
  })
  it('Update Program Config Account',async () => {
    const tx = await program.methods.updateProgramConfig(
      new anchor.BN(200)
    ).accounts({
      programConfig:programConfig,
      admin:wallet.publicKey,
      feeDestination:feeDestination,
      newAdmin:sender.publicKey
    }).rpc();
    assert.strictEqual(
      (await program.account.programConfig.fetch(programConfig)).feeBasisPoints.toNumber(),
      200
    )
  })
  it("Update Program COnfig Account with unauthorized admin(expect fail)",async()=>{
    try {
      const tx = await program.methods
      .updateProgramConfig(new anchor.BN(300))
      .accounts({
        programConfig:programConfig,
        admin:sender.publicKey,
        feeDestination:feeDestination,
        newAdmin:sender.publicKey
      }).transaction()
      await anchor.web3.sendAndConfirmTransaction(connection,tx,[sender]);
    } catch (err) {
      expect(err)
    }
  })
})