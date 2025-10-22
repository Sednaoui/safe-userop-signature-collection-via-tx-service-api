# Safe Smart Account Multisig with AbstractionKit & SafeApiKit

Demonstrates how to use SafeApiKit to manage multi-signature Safe accounts with distributed signature collection.

## What This Example Does

1. Initializes a Safe account with 2 owners and 2/2 signature threshold
2. Deploys the Safe (required before using Safe Transaction Service)
3. Creates batched NFT minting transactions
4. Proposes the UserOperation to Safe Transaction Service
5. Collects signatures from both owners via the API
6. Executes the fully-signed UserOperation with gas sponsorship

## Key Features

- **Distributed Signing**: Signers can sign at different times via the Safe Transaction Service
- **API Coordination**: Uses SafeApiKit for signature collection and management
- **Gas Sponsorship**: Integrated Candide Paymaster for gas-free transactions
- **Automatic Deployment**: Deploys Safe if not already deployed on-chain

## Setup

Create a`.env` file:

```
cp .env.example .env
```

Fill in the values. Get your Safe Transaction Service API key from [Safe Developer](https://developer.safe.global).

## Install

```bash
npm install
```

## Run

```bash
npx ts-node multisig-with-api-kit.ts
```

## Key Methods

- `apiKit.addSafeOperation()` - Propose a UserOperation to Safe Transaction Service
- `apiKit.confirmSafeOperation()` - Add additional signer confirmations
- `SafeAccount.formatSignaturesToUseroperationSignature()` - Combine signatures
- `smartAccount.sendUserOperation()` - Execute the signed UserOperation