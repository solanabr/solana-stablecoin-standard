# Demo Scripts

## Terminal Demo

A simulated terminal demo showing SSS Token CLI operations:

```bash
bash scripts/demo.sh
```

This demonstrates:
1. SSS-1: Initialize stablecoin
2. SSS-1: Grant minter role
3. SSS-1: Mint tokens
4. SSS-1: Burn tokens
5. SSS-2: Enable compliance
6. SSS-2: Blacklist bad actor
7. SSS-2: Emergency pause
8. SSS-2: Asset seizure
9. SSS-2: Resume operations

## Asciinema Recording

To create an actual terminal recording:

```bash
# Install asciinema
pip3 install asciinema

# Record demo
asciinema rec demo.cast -c "bash scripts/demo.sh"

# View locally
asciinema play demo.cast

# Upload to asciinema.org
asciinema upload demo.cast
```

## GIF Demo

To create an animated GIF:

```bash
# Using terminalizer (requires Node.js)
npm install -g terminalizer

# Record
terminalizer record demo.yml

# Render to GIF
terminalizer render demo.yml -o demo.gif
```
