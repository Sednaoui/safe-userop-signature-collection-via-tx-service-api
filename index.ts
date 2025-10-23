import * as dotenv from 'dotenv'
import SafeApiKit from '@safe-global/api-kit'
import {
    SafeAccountV0_2_0 as SafeAccount,
    MetaTransaction,
    getFunctionSelector,
    createCallData,
    CandidePaymaster,
} from "abstractionkit";
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

/**
 * Example: Safe Multisig with SafeApiKit
 *
 * Demonstrates how to use SafeApiKit to manage multi-signature Safe accounts:
 * 1. Initialize a Safe account with multiple owners
 * 2. Create and batch transactions (NFT minting)
 * 3. Propose the UserOperation to Safe Transaction Service
 * 4. Collect signatures from multiple signers
 * 5. Execute the fully-signed UserOperation
 */

async function main(): Promise<void> {
    // Load environment variables
    dotenv.config()
    const chainId = BigInt(process.env.CHAIN_ID as string)
    const bundlerUrl = process.env.BUNDLER_URL as string;
    const nodeUrl = process.env.NODE_URL as string;
    const paymasterUrl = process.env.PAYMASTER_URL as string;
    const sponsorshipPolicyId = process.env.SPONSORSHIP_POLICY_ID;
    const safeTxServiceApiKey = process.env.SAFE_TX_SERVICE_API_KEY as string;

    // Load or generate private keys for the two owners
    const privateKey = (process.env.PRIVATE_KEY || generatePrivateKey()) as `0x${string}`;
    const privateKey2 = (process.env.PRIVATE_KEY_2 || generatePrivateKey()) as `0x${string}`;

    // Initialize SafeApiKit for the target chain
    const apiKit = new SafeApiKit({
        chainId: chainId,
        apiKey: safeTxServiceApiKey,
    });

    // Two owners for the Safe
    const owner1Account = privateKeyToAccount(privateKey);
    const owner2Account = privateKeyToAccount(privateKey2);

    // Initialize a new Safe account with 2 owners and threshold of 2
    // This means both owners must sign for any transaction to execute
    const smartAccount = SafeAccount.initializeNewAccount(
        [owner1Account.address, owner2Account.address],
        {
            threshold: 2
        }
    );

    const safeAddress = smartAccount.accountAddress;

    // Initialize paymaster for gas sponsorship
    const paymaster = new CandidePaymaster(paymasterUrl);

    // Create batched transactions to mint two NFTs
    const nftContractAddress = "0x9a7af758aE5d7B6aAE84fe4C5Ba67c041dFE5336";
    const mintFunctionSelector = getFunctionSelector('mint(address)');
    const mintCallData = createCallData(
        mintFunctionSelector,
        ["address"],
        [smartAccount.accountAddress]
    );

    const nftMintTransactions: MetaTransaction[] = [
        { to: nftContractAddress, value: 0n, data: mintCallData },
        { to: nftContractAddress, value: 0n, data: mintCallData },
    ];

    // Create UserOperation with batched transactions
    let userOperation = await smartAccount.createUserOperation(
        nftMintTransactions,
        nodeUrl,
        bundlerUrl,
        {
            expectedSigners: [owner1Account.address, owner2Account.address],
        }
    );

    // Sponsor the transaction with Candide Paymaster
    const [sponsoredUserOperation] = await paymaster.createSponsorPaymasterUserOperation(
        userOperation,
        bundlerUrl,
        sponsorshipPolicyId
    );
    userOperation = sponsoredUserOperation;

    console.log("UserOperation created and sponsored");

    // Generate EIP-712 hash for signing
    const userOpHash = SafeAccount.getUserOperationEip712Hash(
        userOperation,
        chainId,
    );

    // Owner 1: Sign and propose to Safe Transaction Service
    const owner1Signature = await owner1Account.sign({ hash: userOpHash as `0x${string}` });

    const userOpForApi = {
        ...userOperation,
        signature: owner1Signature,
        nonce: userOperation.nonce.toString(),
    } as any;

    console.log("Proposing UserOperation to Safe Transaction Service...");
    await apiKit.addSafeOperation({
        entryPoint: SafeAccount.DEFAULT_ENTRYPOINT_ADDRESS,
        moduleAddress: SafeAccount.DEFAULT_SAFE_4337_MODULE_ADDRESS,
        safeAddress: smartAccount.accountAddress,
        userOperation: userOpForApi
    });

    // Owner 2: Retrieve pending operation from the Safe Transaction Service
    let pendingOperations = await apiKit.getSafeOperationsByAddress(safeAddress);
    let safeOperation = pendingOperations.results?.[0];

    if (!safeOperation) {
        throw new Error("No pending operations found in Safe Transaction Service");
    }

    // Owner 2: Sign with the hash from the Safe Transaction Service
    const owner2Signature = await owner2Account.sign({ hash: safeOperation.safeOperationHash as `0x${string}` });
    await apiKit.confirmSafeOperation(safeOperation.safeOperationHash, owner2Signature);

    // Retrieve the fully signed operation from the Safe Transaction Service
    pendingOperations = await apiKit.getSafeOperationsByAddress(safeAddress);
    safeOperation = pendingOperations.results?.[0];

    if (!safeOperation?.confirmations || safeOperation.confirmations.length < 2) {
        throw new Error("Not all signatures collected from Safe Transaction Service");
    }

    const signerPairs = safeOperation.confirmations.map(conf => ({
        signer: conf.owner,
        signature: conf.signature
    }));

    userOperation.signature = SafeAccount.formatSignaturesToUseroperationSignature(signerPairs);
    console.log("Signatures collected from Safe Transaction Service");

    console.log("Sending UserOperation to bundler...");
    const sendUserOperationResponse = await smartAccount.sendUserOperation(userOperation, bundlerUrl);
    const receipt = await sendUserOperationResponse.included();

    if (receipt.success) {
        console.log("UserOperation successful");
        console.log("Transaction hash:", receipt.receipt.transactionHash);
    } else {
        throw new Error("UserOperation execution failed");
    }
}

main().catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
});
