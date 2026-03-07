# SSS Frontend Example

A simple React frontend demonstrating the Solana Stablecoin Standard SDK.

## Features

- 🎨 Clean, modern UI with Tailwind CSS
- 👛 Wallet integration (Phantom, Solflare)
- 🚀 Create stablecoins with SSS-1, SSS-2, or SSS-3 presets
- 💰 Mint and burn tokens
- 📊 View balances in real-time
- 🔗 Devnet support

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Usage

1. **Connect Wallet**: Click "Select Wallet" and connect Phantom or Solflare
2. **Create Stablecoin**: Choose a preset (SSS-1, SSS-2, or SSS-3) and configure your token
3. **Mint Tokens**: Enter an amount and mint tokens to your wallet
4. **Burn Tokens**: Burn tokens to reduce supply
5. **Check Balance**: View your token balance in real-time

## Technology Stack

- **React 18**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool
- **Tailwind CSS**: Styling
- **Solana Wallet Adapter**: Wallet integration
- **@stbr/sss-token**: Stablecoin SDK

## Project Structure

```
frontend/
├── src/
│   ├── App.tsx           # Main application component
│   ├── App.css           # Styles
│   ├── main.tsx          # Entry point
│   └── vite-env.d.ts     # Type definitions
├── public/
│   └── index.html        # HTML template
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── vite.config.ts        # Vite config
└── tailwind.config.js    # Tailwind config
```

## Components

### App Component

Main application with:
- Wallet connection
- Stablecoin creation form
- Mint/burn operations
- Balance display

### Features

- **Responsive Design**: Works on desktop and mobile
- **Error Handling**: Toast notifications for all operations
- **Loading States**: Visual feedback during transactions
- **Real-time Updates**: Balance updates after each operation

## Configuration

### Network

Default: Devnet

To change network, edit `src/App.tsx`:

```typescript
const network = WalletAdapterNetwork.Mainnet; // or Devnet, Testnet
```

### RPC Endpoint

Default: Public Solana RPC

For production, use a dedicated RPC:

```typescript
const endpoint = 'https://your-rpc-endpoint.com';
```

## Deployment

### Vercel

```bash
npm run build
vercel deploy
```

### Netlify

```bash
npm run build
netlify deploy --prod --dir=dist
```

### GitHub Pages

```bash
npm run build
# Deploy dist/ folder to gh-pages branch
```

## Screenshots

### Home Page
![Home](./screenshots/home.png)

### Create Stablecoin
![Create](./screenshots/create.png)

### Mint Tokens
![Mint](./screenshots/mint.png)

## Development

### Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Build

```bash
npm run build
```

Output in `dist/` folder

### Lint

```bash
npm run lint
```

## Customization

### Styling

Edit `src/App.css` or use Tailwind classes in components.

### Add Features

Example: Add freeze account feature

```typescript
const freezeAccount = async (address: PublicKey) => {
  if (!stablecoin) return;
  
  await stablecoin.freezeAccount({
    target: address,
    authority: publicKey,
  });
  
  toast.success('Account frozen');
};
```

## Troubleshooting

### Wallet Not Connecting

- Ensure wallet extension is installed
- Check network matches (Devnet/Mainnet)
- Try refreshing the page

### Transaction Failing

- Check wallet has SOL for fees
- Verify you're on correct network
- Check console for error details

### Balance Not Updating

- Click "Refresh Balance" button
- Check transaction confirmed on explorer
- Verify token account exists

## Resources

- [Solana Wallet Adapter](https://github.com/solana-labs/wallet-adapter)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)

## License

MIT

## Support

- GitHub Issues: [Report bugs](https://github.com/solanabr/solana-stablecoin-standard/issues)
- Discord: #frontend-help
- Email: frontend@superteam.fun
