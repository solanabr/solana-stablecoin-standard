#!/usr/bin/env node
import { prompt } from 'enquirer';
import { execSync } from 'child_process';
import { PublicKey } from '@solana/web3.js';

console.clear();
console.log("=========================================");
console.log("       SSS Interactive Admin TUI         ");
console.log("=========================================\n");

async function runTui() {
    let exit = false;
    while (!exit) {
        const response: any = await prompt({
            type: 'select',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                'Initialize Stablecoin (Presets)',
                'Mint Tokens',
                'Blacklist Account (SSS-2)',
                'View Audit Log',
                'Exit'
            ]
        });

        switch (response.action) {
            case 'Initialize Stablecoin (Presets)':
                const p: any = await prompt({
                    type: 'select',
                    name: 'preset',
                    message: 'Select Preset:',
                    choices: ['sss-1', 'sss-2']
                });
                console.log(`\nExecuting: sss-token init --preset ${p.preset}\n`);
                try { execSync(`sss-token init --preset ${p.preset}`, { stdio: 'inherit' }); } catch(e){}
                break;
                
            case 'Mint Tokens':
                const mArgs: any = await prompt([
                    { type: 'input', name: 'mint', message: 'Mint Address:' },
                    { type: 'input', name: 'recipient', message: 'Recipient Address:' },
                    { type: 'input', name: 'amount', message: 'Amount:' }
                ]);
                console.log(`\nExecuting: sss-token mint ${mArgs.mint} ${mArgs.recipient} ${mArgs.amount}\n`);
                try { execSync(`sss-token mint ${mArgs.mint} ${mArgs.recipient} ${mArgs.amount}`, { stdio: 'inherit' }); } catch(e){}
                break;

            case 'Blacklist Account (SSS-2)':
                const bArgs: any = await prompt([
                    { type: 'input', name: 'mint', message: 'Mint Address:' },
                    { type: 'input', name: 'account', message: 'Account to Blacklist:' },
                    { type: 'input', name: 'reason', message: 'Reason:' }
                ]);
                console.log(`\nExecuting: sss-token blacklist add ${bArgs.mint} ${bArgs.account} --reason "${bArgs.reason}"\n`);
                try { execSync(`sss-token blacklist add ${bArgs.mint} ${bArgs.account} --reason "${bArgs.reason}"`, { stdio: 'inherit' }); } catch(e){}
                break;

            case 'View Audit Log':
                const aArgs: any = await prompt({ type: 'input', name: 'mint', message: 'Mint Address:' });
                console.log(`\nExecuting: sss-token audit-log ${aArgs.mint}\n`);
                try { execSync(`sss-token audit-log ${aArgs.mint}`, { stdio: 'inherit' }); } catch(e){}
                break;

            case 'Exit':
                exit = true;
                break;
        }
        console.log("\n");
    }
}

runTui().catch(console.error);
