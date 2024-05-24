import { 
    Aptos, 
    AptosConfig,
    Network, 
    SingleKeyAccount, 
    AccountAddress, 
    Ed25519PrivateKey, 
    SimpleTransaction,
    MultiAgentTransaction,
    MoveString,
    CommittedTransactionResponse,
    SigningSchemeInput
} from "@aptos-labs/ts-sdk";
import { readFileSync } from "fs";
import { GasStationClient } from "@shinami/clients/aptos";

// Create an Aptos client for building and submitting our transactions.
const aptos = new Aptos(new AptosConfig({ network: Network.TESTNET}));

// Create a Shinami Gas Station client for sponsoring our transactions.
const SHINAMI_TESTNET_GAS_KEY = "{{APTOS_TESTNET_GAS_STATION_ACCESS_KEY}}";
const gasStationClient = new GasStationClient(SHINAMI_TESTNET_GAS_KEY);

let executedTransaction = await buildSponsorSignAndSubmitSimpleTransaction();
// let executedTransaction = await buildSponsorSignAndSubmitMultiAgentTransaction();
console.log("\nTransaction hash:", executedTransaction.hash);
console.log("Transaction status:", executedTransaction.vm_status);



// Build, sponsor, sign, and execute a simple Move call transaction
async function buildSponsorSignAndSubmitSimpleTransaction(): Promise<CommittedTransactionResponse> {
    // 1. Set up our sender.
    const sender = await generateSingleKeyAccountEd25519();
    
    // 2. Build a simple transaction.
    let transaction = await buildSimpleMoveCallTransaction(sender.accountAddress);

    // 3. Sponsor the transaction with Shinami Gas Station.
    let feePayerAuthenticator = await gasStationClient.sponsorTransaction(transaction);
    // Note that the SDK updates the transaction's feePayer address on a successful sponsorship
    console.log("\ntransaction.feePayerAddress post-sponsorship:", transaction.feePayerAddress);
    
    // 4. Generate the sender's signature. 
    const senderAuthenticator = aptos.transaction.sign({ 
        signer: sender, 
        transaction 
    });
    
    // 5. Submit the transaction with the sender and fee payer signatures
    const committedTransaction = await aptos.transaction.submit.simple({
        transaction,
        senderAuthenticator,
        feePayerAuthenticator: feePayerAuthenticator,
    });
    
    // 6. Wait for and retrieve the executed transaction
    const executedTransaction = await aptos.waitForTransaction({
        transactionHash: committedTransaction.hash
    });
    
    return executedTransaction;
}



// Helper function to generate a SingleKeyAccount for easy use with this tutorial.
//  If the argument is set to true, the account will be funded.
//  Not meant as best practice - your app should have its own way of managing Accounts and keys.
async function generateSingleKeyAccountEd25519(fund = false) : Promise<SingleKeyAccount> {
    const account: SingleKeyAccount = SingleKeyAccount.generate({ scheme: SigningSchemeInput.Ed25519});
    if (fund) {
        await aptos.fundAccount({
            accountAddress: account.accountAddress,
            amount: 100000000
        });
    }
    return account;
}


// Build a Move call simple transaction with a fee payer
async function buildSimpleMoveCallTransaction(sender: AccountAddress, expirationSeconds?: number): Promise<SimpleTransaction> {

    let transaction =  await aptos.transaction.build.simple({
        sender: sender,
        withFeePayer: true,
        data: {
          function: "0xc13c3641ba3fc36e6a62f56e5a4b8a1f651dc5d9dc280bd349d5e4d0266d0817::message::set_message",
          functionArguments: [new MoveString("Test message")]
        },
        options: {
            expireTimestamp: expirationSeconds
        }
    });
    console.log("\nResponse from aptos.transaction.build.simple()");
    console.log(transaction);
    return transaction;
}



// Build, sponsor, sign, and execute a multiAgent Move script transaction
async function buildSponsorSignAndSubmitMultiAgentTransaction(): Promise<CommittedTransactionResponse> {

    // 1. Generate two funded accounts to act as sender and secondary signer
    const sender = await generateSingleKeyAccountEd25519(true); 
    const secondarySigner = await generateSingleKeyAccountEd25519(true); 

    // 2. Build a multiAgent transaction
    let transaction = await buildMultiAgentScriptTransaction(sender.accountAddress, secondarySigner.accountAddress);

    // 3. Sponsor the transaction with Shinami Gas Station
    let feePayerAuthenticator = await gasStationClient.sponsorTransaction(transaction);
    // Note that the SDK upates the transaction's feePayer address on a successful sponsorship
    console.log("\ntransaction.feePayerAddress post-sponsorship:", transaction.feePayerAddress);

    // 4. Generate the sender and secondary signer signatures
    const senderAuthenticator = aptos.transaction.sign({ 
        signer: sender, 
        transaction 
    });

    const secondarySignerAuthenticator = aptos.transaction.sign({
       signer: secondarySigner,
       transaction 
    }); 

    // 5. Submit the transaction with the sender, seconardy signer, and feePayer signatures
    const committedTransaction = await aptos.transaction.submit.multiAgent({
        transaction,
        senderAuthenticator,
        additionalSignersAuthenticators: [secondarySignerAuthenticator],
        feePayerAuthenticator: feePayerAuthenticator
    });

    // 6. Wait for and retrieve the executed transaction
    const executedTransaction = await aptos.waitForTransaction({
        transactionHash: committedTransaction.hash
    });

    return executedTransaction;

}



// Build a multi-agent script transaction with a fee payer.
async function buildMultiAgentScriptTransaction(sender: AccountAddress, secondarySigner: AccountAddress, 
    expirationSeconds?: number) : Promise<MultiAgentTransaction> {

    let buffer = readFileSync("./move/build/test/bytecode_scripts/unfair_swap_coins.mv");
    let bytecode = Uint8Array.from(buffer);

    let transaction = await aptos.transaction.build.multiAgent({
        sender: sender,
        secondarySignerAddresses: [secondarySigner],
        withFeePayer: true,
        data: {
            bytecode: bytecode,
            functionArguments: []
        },
        options: {
            expireTimestamp: expirationSeconds
        }
    });

    console.log("\nResponse from aptos.transaction.build.multiAgent()");
    console.log(transaction);
    return transaction;
}