export function renderDocumentationPage({ button, pill, launchRoute, state, escapeHtml }) {
  const docsMetrics = [
    ["3", "Preset tiers", "SSS-1, SSS-2, and SSS-3"],
    ["4", "Backend services", "Mint, indexer, compliance, webhooks"],
    ["On-chain", "Registry", "Release records plus stablecoin registrations"],
    ["Token-2022", "Base standard", "Extensions-first mint architecture"],
  ];

  const docNav = [
    ["docs-overview", "Overview", "How the repo is organized", "home"],
    ["docs-presets", "Presets", "SSS-1 through SSS-3", "layers"],
    ["docs-cli", "CLI", "Operational command surface", "terminal"],
    ["docs-sdk", "SDK", "Programmatic integration", "deployed_code"],
    ["docs-tech", "Architecture", "Programs, PDAs, security", "account_tree"],
    ["docs-registry", "Registry", "Discovery and release records", "inventory_2"],
    ["docs-api", "Backend API", "Services, ports, auth, limits", "dns"],
    ["docs-deploy", "Deployment", "Build, verify, devnet runbook", "rocket_launch"],
    ["docs-errors", "Warnings", "Common operator failures", "warning"],
  ];

  const docMap = [
    ["terminal", "CLI", "Issue, pause, freeze, blacklist, seize, inspect, and register deployments from the operator shell."],
    ["deployed_code", "SDK", "Build transactions, create stablecoins on-chain, manage compliance roots, and submit proof receipts."],
    ["account_tree", "Architecture", "Three-layer model spanning Anchor programs, SDK surfaces, optional modules, and named presets."],
    ["inventory_2", "Registry", "Machine-readable SSS identity, versioning, deprecation checks, and stablecoin discovery."],
    ["dns", "Backend", "Mint service, event indexer, compliance service, and webhook delivery under a shared auth model."],
    ["verified", "Operations", "Local verification, localnet smoke tests, and a full devnet deployment path for submission evidence."],
  ];

  const presetCards = [
    {
      tier: "SSS-1",
      tone: "primary",
      title: "Minimal Stablecoin",
      abstract: "Minimum issuance control surface for Solana deployments: mint authority, freeze authority, metadata, pause support, and role-based delegation.",
      spec: [
        "Base mint metadata and authorities",
        "Mint, burn, freeze, thaw, pause, and unpause",
        "Role assignment for minters, burners, and pausers",
      ],
      compliance: "Reactive compliance. Operators can freeze accounts when needed, but transfers are not proactively screened on-chain.",
    },
    {
      tier: "SSS-2",
      tone: "primary",
      title: "Compliant Stablecoin",
      abstract: "Extends SSS-1 with proactive transfer screening and seizure-oriented controls for regulated issuers.",
      spec: [
        "All SSS-1 capabilities",
        "Permanent delegate enabled at mint creation",
        "Transfer hook enabled for blacklist checks",
        "Blacklist add/remove flows and seizure support",
      ],
      compliance: "Transfers are intended to be checked on every move using the transfer-hook module. Blacklisted accounts can be frozen and balances redirected under authorized procedures.",
    },
    {
      tier: "SSS-3",
      tone: "warning",
      title: "Confidential Compliant Stablecoin",
      abstract: "Adds a privacy-preserving compliance model with confidential transfers, proof receipts, and compressed compliance roots.",
      spec: [
        "All SSS-2 capabilities",
        "Confidential transfer capability in protocol config",
        "ZK compliance proof receipt capability flag",
        "Compressed compliance-state root support",
      ],
      compliance: "The transfer gate stays intact while the evidence model changes. Eligibility is proven with a proof receipt rather than a plain per-address compliance check.",
    },
  ];

  const presetTable = [
    ["Mint/Burn", "Yes", "Yes", "Yes"],
    ["Freeze/Thaw", "Yes", "Yes", "Yes"],
    ["Pause", "Yes", "Yes", "Yes"],
    ["Permanent Delegate", "No", "Yes", "Yes"],
    ["Transfer Hook", "No", "Yes", "Yes"],
    ["Blacklist", "No", "Yes", "Yes"],
    ["Token Seizure", "No", "Yes", "Yes"],
    ["Confidential Transfers", "No", "No", "Yes"],
    ["ZK Compliance Proofs", "No", "No", "Yes"],
    ["Compressed Compliance State", "No", "No", "Yes"],
  ];

  const cliGroups = [
    ["Common commands", [
      "sss-token init --preset sss-1 --rpc https://api.devnet.solana.com --keypair ~/.config/solana/id.json",
      "sss-token mint <destination_token_account> <amount> --mint <mint_address> --program-id <stablecoin_program_id>",
      "sss-token burn <source_token_account> <amount> --mint <mint_address> --program-id <stablecoin_program_id>",
      "sss-token freeze <token_account> --mint <mint_address> --program-id <stablecoin_program_id>",
      "sss-token thaw <token_account> --mint <mint_address> --program-id <stablecoin_program_id>",
      "sss-token status --mint <mint_address> --program-id <stablecoin_program_id>",
    ]],
    ["SSS-2 commands", [
      "sss-token blacklist add <address> --reason \"OFAC match\" --mint <mint_address> --program-id <stablecoin_program_id>",
      "sss-token blacklist remove <address> --mint <mint_address> --program-id <stablecoin_program_id>",
      "sss-token seize <from_token_account> --to <treasury_token_account> --mint <mint_address> --program-id <stablecoin_program_id>",
      "sss-token minters grant <operator_pubkey> --mint <mint_address> --program-id <stablecoin_program_id> --quota 1000000000",
      "sss-token registry-register --mint <mint_address> --program-id <stablecoin_program_id> --registry-program-id <registry_program_id>",
    ]],
    ["SSS-3 commands", [
      "sss-token init --preset sss-3 --program-id <stablecoin_program_id> --transfer-hook-program-id <transfer_hook_program_id>",
      "sss-token init-hook --mint <mint_address> --transfer-hook-program-id <transfer_hook_program_id>",
      "sss-token registry-release --registry-program-id <registry_program_id> --standard-version sss/1.1.0",
    ]],
  ];

  const cliRules = [
    "Use separate keys for master authority and operational roles.",
    "Blacklist actions should be paired with an audit note and external case identifier.",
    "The CLI fails fast on missing addresses, zero amounts, invalid decimals, oversize metadata, and empty blacklist reasons.",
    "CLI config files can extend presets, local TOML files, and local JSON files recursively.",
  ];

  const sdkExports = [
    "config",
    "accountState",
    "constants",
    "bytes",
    "hash",
    "idl",
    "instructions",
    "SolanaStablecoin",
    "compliance",
    "presets",
    "registry",
    "registryProgram",
    "transferHook",
    "types",
    "validation",
    "wallet",
  ];

  const architectureLayers = [
    ["Layer 1", "Base SDK", "Anchor programs, TypeScript SDK, CLI, and backend services."],
    ["Layer 2", "Optional modules", "Compliance, registry, transfer-hook, and experimental confidential-compliance capabilities."],
    ["Layer 3", "Named presets", "SSS-1, SSS-2, and SSS-3 as recognizable deployment profiles."],
  ];

  const techSurfaces = [
    ["Stablecoin program", "Core mint configuration, authorities, roles, pause state, blacklist, seizure, and SSS-3 proof receipts."],
    ["Transfer-hook program", "Enforces blacklist or proof-receipt checks at transfer time for gated deployments."],
    ["SSS Registry program", "Stores release records and stablecoin registrations for discoverability and deprecation checks."],
    ["ZK compliance crate", "Generates proofs and powers the `sss-zk-prove` workflow used by SSS-3."],
    ["TypeScript SDK", "Builds transactions, validates config, and exposes a programmatic integration surface."],
    ["Backend services", "Operational APIs for mint requests, events, compliance workflows, and webhook fanout."],
  ];

  const pdaRows = [
    ["StablecoinConfig", "[b\"stablecoin_config\", mint]", "Global token configuration"],
    ["RoleAssignment", "[b\"role\", mint, role_byte, holder]", "Per-role assignment with optional minter quota"],
    ["BlacklistEntry", "[b\"blacklist\", mint, address]", "Blacklist record for SSS-2"],
    ["RegistryConfig", "[b\"sss_registry_config\"]", "Global authority/config for SSS Registry"],
    ["ReleaseRecord", "[b\"sss_release\", standard_version]", "Published SSS release metadata"],
    ["StablecoinRegistration", "[b\"sss_stablecoin\", mint]", "On-chain stablecoin discovery record"],
  ];

  const registryFlows = [
    "Registry authority initializes the global config.",
    "Registry authority publishes release metadata for each standard version.",
    "Issuer registers a stablecoin with config hash, preset, and immutable feature flags.",
    "Wallets and DeFi protocols compare stablecoin registrations against release records to detect deprecated versions.",
  ];

  const services = [
    ["Mint Service", "3001", ["POST /mint/request", "POST /mint/execute/:requestId", "GET /mint/status/:requestId", "GET /mint/history", "GET /health"]],
    ["Event Indexer", "3002", ["GET /events", "POST /webhooks/subscribe", "GET /registry", "POST /registry"]],
    ["Compliance Service", "3003", ["GET /blacklist", "POST /blacklist", "DELETE /blacklist/:address", "GET /audit-log", "POST /sanctions-screen"]],
    ["Webhook Service", "3004", ["POST /webhooks/subscribe", "GET /webhooks", "DELETE /webhooks/:id", "GET /health"]],
  ];

  const errors = [
    ["E-AUTH-01", "Connect a wallet to continue.", "Verify browser extension injection and confirm the frontend is served over http://127.0.0.1 instead of file://."],
    ["E-NET-04", "Switch to the configured cluster.", "Check the RPC endpoint in settings and confirm the selected wallet is pointed at the same cluster."],
    ["E-PROG-09", "Program ID missing or invalid.", "Import the deployment manifest or verify the stablecoin, transfer-hook, and registry program IDs before running live actions."],
    ["E-ROLE-02", "Required role missing.", "Grant the correct RoleAssignment PDA or rotate authority through the protocol rather than the raw token mint."],
    ["E-STATE-11", "Stablecoin paused.", "Pause state must be cleared before mint, burn, or transfer flows can continue."],
    ["E-COMP-07", "Address blacklisted.", "Review blacklist state, compliance notes, and whether the address should be frozen, released, or seized."],
    ["E-ZK-03", "No valid proof receipt.", "Regenerate the SSS-3 witness, submit the proof receipt again, and verify it matches the active compliance root."],
    ["E-ZK-05", "Proof expired.", "Proof receipts are slot-bound. Re-submit a fresh receipt before retrying the gated transfer."],
    ["E-DATA-01", "Registry missing fields.", "Website, jurisdiction, and related registry metadata must be present before publication succeeds."],
  ];

  const warnings = [
    ["Immutable SSS-2 flags", "SSS-2 capability flags are immutable after initialization. Review multisig owners and extension choices before deployment."],
    ["Token-2022 init order", "Initialize mint extensions before initialize_mint2 to avoid Token-2022 setup footguns and locked-fund scenarios."],
    ["Authority separation", "Do not let one hot key hold issuance, pause, blacklist, and seizure responsibility at the same time."],
    ["Backend auth", "Every backend request except /health must include x-api-key: <SERVICE_API_KEY> or Authorization: Bearer <SERVICE_API_KEY>."],
    ["SSS-3 is advanced", "SSS-3 keeps the compliance boundary intact, but it adds circuit, proof, and receipt lifecycle complexity that operators must understand."],
    ["Transfer gating", "For SSS-2 and SSS-3, initialize the transfer-hook meta list before any gated transfer or proof-driven flow."],
  ];

  const quickStartCode = [
    "npm install",
    "npm run build",
    "npm run build:programs",
    "npm run verify",
    "npm run smoke:localnet:e2e",
    "docker compose up --build",
    "sss-token init --preset sss-1 --rpc https://api.devnet.solana.com --keypair ~/.config/solana/id.json",
  ].join("\n");

  const sdkExampleCode = [
    "import { Presets, SolanaStablecoin } from \"@stbr/sss-token\";",
    "",
    "const stable = await SolanaStablecoin.create({",
    "  connection,",
    "  authority,",
    "  preset: Presets.SSS_2,",
    "  name: \"My Stablecoin\",",
    "  symbol: \"MYUSD\",",
    "  decimals: 6",
    "});",
    "",
    "await stable.mint({ recipient, amount: 1_000_000n, minter: authority });",
    "await stable.compliance.blacklistAdd(address, \"Sanctions match\");",
  ].join("\n");

  const proofFlowCode = [
    "await stable.updateComplianceRootOnChain(rootHex);",
    "await stable.initializeTransferHookMetaListOnChain();",
    "await stable.submitProofReceiptOnChain({",
    "  subject,",
    "  commitment,",
    "  proofCommitment,",
    "  response,",
    "  merkleSiblings,",
    "  merkleDirections,",
    "  circuit: \"sss3-merkle-schnorr-v1\",",
    "  expiresAtSlot",
    "});",
    "await stable.revokeProofReceiptOnChain(subject);",
  ].join("\n");

  const cliConfigCode = [
    "[preset]",
    "extends = [\"./SAMPLE_ISSUER_BASE.toml\"]",
    "",
    "[overrides]",
    "name = \"Example Regulated USD\"",
    "symbol = \"rUSD\"",
    "default_account_frozen = false",
    "standard_version = \"sss/1.0.0\"",
    "",
    "[registry]",
    "homepage = \"https://issuer.example.com\"",
    "jurisdiction = \"US\"",
  ].join("\n");

  const deploymentCode = [
    "npm run devnet:preflight",
    "npm run devnet:manifest",
    "npm run build:programs",
    "solana program deploy target/deploy/transfer_hook.so --program-id <transfer_hook_program_id> --url \"$SSS_RPC_URL\"",
    "solana program deploy target/deploy/stablecoin.so --program-id <stablecoin_program_id> --url \"$SSS_RPC_URL\"",
    "solana program deploy target/deploy/sss_registry.so --program-id <registry_program_id> --url \"$SSS_RPC_URL\"",
    "sss-token registry-release --registry-program-id <registry_program_id> --standard-version sss/1.1.0 --preset sss-3 --notes-uri https://example.com/releases/sss-1-1-0",
    "sss-token registry-register --mint <mint_address> --program-id <stablecoin_program_id> --registry-program-id <registry_program_id> --homepage https://issuer.example.com --jurisdiction US",
    "npm run devnet:verify",
  ].join("\n");

  const renderBulletList = (items) => `
    <div class="doc-list">
      ${items.map((item) => `
        <div class="inline-main">
          <span class="material-symbols-outlined">check_circle</span>
          <span>${escapeHtml(item)}</span>
        </div>
      `).join("")}
    </div>
  `;

  const overviewSection = `
    <section class="panel docs-section" id="docs-overview">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Overview</p>
          <h3 class="panel-title">Repository Orientation</h3>
          <p class="panel-subtitle">SSS is a modular open-source SDK and reference implementation for issuing Token-2022 stablecoins on Solana. It is intentionally structured as a layered system rather than a single hard-coded product template.</p>
        </div>
        ${pill("Open-source", "success")}
      </div>
      <div class="docs-card-grid">
        ${docMap.map(([icon, title, copy]) => `
          <article class="card">
            <div class="inline-main">
              <span class="icon-chip"><span class="material-symbols-outlined">${icon}</span></span>
              <h3>${escapeHtml(title)}</h3>
            </div>
            <p>${escapeHtml(copy)}</p>
          </article>
        `).join("")}
      </div>
      <div class="two-col">
        <article class="summary-card">
          <small class="eyebrow">Quick start</small>
          <pre class="code-block mono">${escapeHtml(quickStartCode)}</pre>
        </article>
        <article class="summary-card">
          <small class="eyebrow">Why this repo matters</small>
          ${renderBulletList([
            "SSS-2 enforces blacklist checks through a dedicated transfer-hook path instead of passive metadata alone.",
            "The registry makes stablecoin presets and release versions queryable by wallets, DeFi protocols, and auditors.",
            "Role-based operations route through the stablecoin config PDA so issuers can delegate safely without sharing raw mint authority.",
          ])}
        </article>
      </div>
    </section>
  `;

  const presetsSection = `
    <section class="panel docs-section" id="docs-presets">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Presets</p>
          <h3 class="panel-title">SSS-1, SSS-2, and SSS-3</h3>
          <p class="panel-subtitle">Three named standards map the most common issuance profiles into recognizable, auditable deployment tiers.</p>
        </div>
        ${pill("Named standards", "primary")}
      </div>
      <div class="docs-preset-grid">
        ${presetCards.map((preset) => `
          <article class="card docs-preset-card ${preset.tone === "warning" ? "is-warning" : ""}">
            <div class="row-split">
              ${pill(preset.tier, preset.tone)}
              ${preset.tier === "SSS-3" ? pill("Advanced", "warning") : preset.tier === "SSS-2" ? pill("Recommended", "success") : ""}
            </div>
            <h3 class="display">${escapeHtml(preset.title)}</h3>
            <p>${escapeHtml(preset.abstract)}</p>
            <small class="eyebrow">Specification</small>
            ${renderBulletList(preset.spec)}
            <small class="eyebrow">Compliance model</small>
            <p>${escapeHtml(preset.compliance)}</p>
          </article>
        `).join("")}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>SSS-1</th>
              <th>SSS-2</th>
              <th>SSS-3</th>
            </tr>
          </thead>
          <tbody>
            ${presetTable.map(([feature, sss1, sss2, sss3]) => `
              <tr>
                <td>${escapeHtml(feature)}</td>
                <td>${escapeHtml(sss1)}</td>
                <td>${escapeHtml(sss2)}</td>
                <td>${escapeHtml(sss3)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;

  const cliSection = `
    <section class="panel docs-section" id="docs-cli">
      <div class="panel-header">
        <div>
          <p class="eyebrow">CLI</p>
          <h3 class="panel-title">Operational Command Surface</h3>
          <p class="panel-subtitle">The sss-token CLI covers initialization, supply operations, compliance actions, registry publishing, and devnet-ready deployment flows.</p>
        </div>
        ${pill("sss-token", "primary")}
      </div>
      <div class="docs-command-grid">
        ${cliGroups.map(([title, commands]) => `
          <article class="summary-card">
            <small class="eyebrow">${escapeHtml(title)}</small>
            <div class="doc-command-list">
              ${commands.map((command) => `<code class="doc-command mono">${escapeHtml(command)}</code>`).join("")}
            </div>
          </article>
        `).join("")}
      </div>
      <div class="two-col">
        <article class="summary-card">
          <small class="eyebrow">Config inheritance</small>
          <pre class="code-block mono">${escapeHtml(cliConfigCode)}</pre>
        </article>
        <article class="summary-card">
          <small class="eyebrow">Operator guidance</small>
          ${renderBulletList(cliRules)}
          <div class="doc-callout warning">
            <span class="material-symbols-outlined">warning</span>
            <p>Real on-chain creation happens when --dry-run is omitted, the signer is funded, the RPC is reachable, and the stablecoin program is deployed.</p>
          </div>
        </article>
      </div>
    </section>
  `;

  const sdkSection = `
    <section class="panel docs-section" id="docs-sdk">
      <div class="panel-header">
        <div>
          <p class="eyebrow">SDK</p>
          <h3 class="panel-title">Programmatic Integration Surface</h3>
          <p class="panel-subtitle">Import from @stbr/sss-token to create deployments, mint assets, manage compliance, build registry instructions, and drive SSS-3 proof workflows from code.</p>
        </div>
        ${pill("@stbr/sss-token", "success")}
      </div>
      <div class="two-col">
        <article class="summary-card">
          <small class="eyebrow">Entry point</small>
          <pre class="code-block mono">${escapeHtml(sdkExampleCode)}</pre>
        </article>
        <article class="summary-card">
          <small class="eyebrow">SSS-3 proof lifecycle</small>
          <pre class="code-block mono">${escapeHtml(proofFlowCode)}</pre>
        </article>
      </div>
      <div class="two-col">
        <article class="summary-card">
          <small class="eyebrow">Preset coverage</small>
          ${renderBulletList([
            "Presets.SSS_1 for mint, burn, freeze, and pause baseline flows.",
            "Presets.SSS_2 for permanent delegate, transfer hooks, blacklist enforcement, and registry metadata.",
            "Presets.SSS_3 for confidential-transfer-ready config, proof receipts, and compressed compliance roots.",
          ])}
        </article>
        <article class="summary-card">
          <small class="eyebrow">Export surface</small>
          <div class="badge-cluster">
            ${sdkExports.map((item) => pill(item, "primary")).join("")}
          </div>
        </article>
      </div>
      <article class="summary-card">
        <small class="eyebrow">Additional builders and helpers</small>
        ${renderBulletList([
          "Registry builders: buildRegisterReleaseInstruction and buildRegisterStablecoinInstruction.",
          "Operational builders: blacklist add/remove and authority transfer transaction helpers.",
          "IDL loading via loadIdl(path) for generated Anchor metadata.",
          "Validation helpers that reject invalid metadata, zero amounts, and empty blacklist reasons before instruction construction.",
        ])}
      </article>
    </section>
  `;
  const techSection = `
    <section class="panel docs-section" id="docs-tech">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Architecture</p>
          <h3 class="panel-title">Layer Model, Programs, and Security</h3>
          <p class="panel-subtitle">The project separates reusable issuance tooling, optional modules, and named presets so standards adoption and issuer customization do not fight each other.</p>
        </div>
        ${pill("Three-layer model", "primary")}
      </div>
      <div class="docs-card-grid">
        ${architectureLayers.map(([layer, title, copy]) => `
          <article class="card">
            <p class="eyebrow">${escapeHtml(layer)}</p>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(copy)}</p>
          </article>
        `).join("")}
      </div>
      <div class="docs-card-grid">
        ${techSurfaces.map(([title, copy]) => `
          <article class="card">
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(copy)}</p>
          </article>
        `).join("")}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Seeds</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            ${pdaRows.map(([account, seeds, purpose]) => `
              <tr>
                <td>${escapeHtml(account)}</td>
                <td><code class="mono">${escapeHtml(seeds)}</code></td>
                <td>${escapeHtml(purpose)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="two-col">
        <article class="summary-card">
          <small class="eyebrow">Security model</small>
          ${renderBulletList([
            "The master authority initializes the token and delegates operational permissions through RoleAssignment PDAs.",
            "Mint, freeze, transfer-hook, and permanent-delegate powers are assigned to the stablecoin config PDA rather than directly to operators.",
            "Role separation reduces the chance that one operator key becomes the entire risk boundary.",
            "SSS-2 capability flags are immutable after initialization.",
          ])}
        </article>
        <article class="summary-card">
          <small class="eyebrow">SSS-3 verifier model</small>
          ${renderBulletList([
            "Proofs are generated by the in-repo sss-zk-compliance crate and sss-zk-prove binary.",
            "The stablecoin program verifies the compliance proof before writing a ProofReceipt PDA.",
            "The transfer-hook program blocks transfers unless the sender has a matching, unexpired receipt for the current root.",
            "The shipped circuit identifier is sss3-merkle-schnorr-v1.",
          ])}
        </article>
      </div>
    </section>
  `;

  const registrySection = `
    <section class="panel docs-section" id="docs-registry">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Registry</p>
          <h3 class="panel-title">Discovery, Release Metadata, and Verifiable Identity</h3>
          <p class="panel-subtitle">The registry turns SSS from a claimed standard into a machine-readable one. Integrators can query whether a mint is an SSS deployment, which preset it uses, and whether the release line is deprecated.</p>
        </div>
        ${pill("On-chain registry", "success")}
      </div>
      <div class="two-col">
        <article class="summary-card">
          <small class="eyebrow">Registry carries</small>
          ${renderBulletList([
            "Preset class (sss-1, sss-2, or sss-3).",
            "Standard version and deterministic config hash.",
            "Immutable feature flags and issuer metadata.",
            "Release records for deprecation and upgrade signaling.",
          ])}
        </article>
        <article class="summary-card">
          <small class="eyebrow">Program flow</small>
          ${renderBulletList(registryFlows)}
        </article>
      </div>
      <article class="summary-card">
        <small class="eyebrow">Strategic value</small>
        ${renderBulletList([
          "Issuers get a portable standards identity that can be referenced outside their own infrastructure.",
          "Wallets and DeFi protocols can query a canonical answer instead of trusting issuer PDFs or ad hoc allowlists.",
          "Release records make upgrades and deprecations legible to auditors and integration partners.",
        ])}
      </article>
    </section>
  `;

  const apiSection = `
    <section class="panel docs-section" id="docs-api">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Backend API</p>
          <h3 class="panel-title">Service Endpoints, Auth, and Limits</h3>
          <p class="panel-subtitle">All backend services are Dockerized and share the same security model for authenticated requests, body limits, and rate limits.</p>
        </div>
        ${pill("docker compose up --build", "warning")}
      </div>
      <div class="docs-service-grid">
        ${services.map(([name, port, endpoints]) => `
          <article class="summary-card">
            <div class="row-split">
              <div>
                <small class="eyebrow">${escapeHtml(name)}</small>
                <h3>${escapeHtml(name)}</h3>
              </div>
              ${pill(`:${port}`, "primary")}
            </div>
            <div class="doc-command-list">
              ${endpoints.map((endpoint) => `<code class="doc-command mono">${escapeHtml(endpoint)}</code>`).join("")}
            </div>
          </article>
        `).join("")}
      </div>
      <div class="two-col">
        <article class="summary-card">
          <small class="eyebrow">Auth model</small>
          ${renderBulletList([
            "Every endpoint except GET /health requires authentication.",
            "Use x-api-key: <SERVICE_API_KEY> or Authorization: Bearer <SERVICE_API_KEY>.",
            "Default body limit is 65536 bytes.",
            "Default rate limit is 120 authenticated requests per minute per client/IP key pair.",
          ])}
        </article>
        <article class="summary-card">
          <small class="eyebrow">Operator notes</small>
          ${renderBulletList([
            "Event Indexer POST /registry returns 400 InvalidRegistryEntry when required registry fields are missing or malformed.",
            "The backend stack can be run from the repo root without changing directories.",
            "Health endpoints are the only unauthenticated surfaces and should be used for liveness checks only.",
          ])}
        </article>
      </div>
    </section>
  `;

  const deploySection = `
    <section class="panel docs-section" id="docs-deploy">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Deployment</p>
          <h3 class="panel-title">Build, Verify, and Devnet Runbook</h3>
          <p class="panel-subtitle">The repository includes a deterministic local verification pass, validator-backed smoke harnesses, and an explicit devnet deployment path for registry-backed example mints.</p>
        </div>
        ${pill("Devnet runbook", "warning")}
      </div>
      <div class="two-col">
        <article class="summary-card">
          <small class="eyebrow">Deployment path</small>
          <pre class="code-block mono">${escapeHtml(deploymentCode)}</pre>
        </article>
        <article class="summary-card">
          <small class="eyebrow">Validation ladder</small>
          ${renderBulletList([
            "npm run verify for deterministic local validation of the SDK, CLI helpers, and backend shared primitives.",
            "npm run smoke:localnet for RPC-backed SSS-1 and SSS-2 smoke coverage when a local validator is running.",
            "npm run smoke:localnet:e2e for the full registry + SSS-1/2/3 local validator flow including proof receipts.",
            "npm run devnet:preflight, devnet:manifest, and devnet:verify after deploying to devnet.",
          ])}
          <div class="doc-callout success">
            <span class="material-symbols-outlined">verified</span>
            <p>devnet:manifest writes artifacts/devnet-manifest.json with commit metadata, program IDs, binary hashes, and known mint env vars.</p>
          </div>
        </article>
      </div>
      <article class="summary-card">
        <small class="eyebrow">SSS-3 evidence checklist</small>
        ${renderBulletList([
          "Capture the SSS-3 mint address.",
          "Record the compliance root update signature.",
          "Record the proof receipt submission signature.",
          "Capture a successful gated transfer signature.",
          "Capture a failed transfer after proof revoke.",
        ])}
      </article>
    </section>
  `;

  const errorsSection = `
    <section class="panel docs-section" id="docs-errors">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Warnings</p>
          <h3 class="panel-title">Common Errors and Operational Cautions</h3>
          <p class="panel-subtitle">The frontend, CLI, and backend flows all assume correct authority setup, matching cluster config, deployed program IDs, and complete registry metadata.</p>
        </div>
        ${pill("Operator critical path", "danger")}
      </div>
      <div class="docs-error-grid">
        ${errors.map(([code, title, resolution]) => `
          <article class="card docs-error-card">
            <p class="eyebrow">${escapeHtml(code)}</p>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(resolution)}</p>
          </article>
        `).join("")}
      </div>
      <div class="docs-warning-stack">
        ${warnings.map(([title, copy]) => `
          <article class="doc-callout warning">
            <span class="material-symbols-outlined">warning</span>
            <div>
              <strong>${escapeHtml(title)}</strong>
              <p>${escapeHtml(copy)}</p>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;

  return `
    <section class="page-header docs-page-header">
      <div>
        <p class="eyebrow">Reference</p>
        <h1 class="headline">Protocol Documentation</h1>
        <p class="subline">Detailed operator, SDK, architecture, registry, API, and deployment guidance built from the current repository docs.</p>
      </div>
      <div class="button-row">
        ${button("landing", "Back to Landing", "ghost", "west")}
        ${button(launchRoute(), state.connected ? "Open Dashboard" : "Connect Wallet", "primary", state.connected ? "north_east" : "account_balance_wallet")}
      </div>
    </section>

    <section class="panel docs-hero">
      <div class="docs-hero-copy">
        <div class="badge-cluster">
          ${pill("CLI", "primary")}
          ${pill("SDK", "primary")}
          ${pill("Registry", "success")}
          ${pill("Backend API", "warning")}
        </div>
        <h2 class="panel-title">Everything needed to build, operate, and verify an SSS deployment.</h2>
        <p class="panel-subtitle">The page mirrors the current frontend aesthetic while consolidating the repo's architecture docs, preset specs, CLI flows, SDK entry points, backend services, registry model, and devnet deployment runbook into one operator-grade reference.</p>
        <div class="button-row">
          <button class="button secondary" data-doc-target="docs-cli">Jump to CLI <span class="material-symbols-outlined">south</span></button>
          <button class="button ghost" data-doc-target="docs-sdk">Jump to SDK <span class="material-symbols-outlined">south</span></button>
          <button class="button ghost" data-doc-target="docs-deploy">Jump to Deployment <span class="material-symbols-outlined">south</span></button>
        </div>
      </div>
      <div class="stat-grid">
        ${docsMetrics.map(([value, label, foot]) => `
          <article class="stat-card">
            <div class="eyebrow">${escapeHtml(label)}</div>
            <span class="stat-value">${escapeHtml(value)}</span>
            <div class="stat-foot">${escapeHtml(foot)}</div>
          </article>
        `).join("")}
      </div>
    </section>

    <div class="docs-layout">
      <aside class="panel docs-sidebar">
        <div class="docs-sidebar-block">
          <p class="eyebrow">Documentation map</p>
          <h3 class="panel-title">Sections</h3>
        </div>
        <div class="docs-nav-list">
          ${docNav.map(([target, label, detail, icon]) => `
            <button class="docs-nav-item" data-doc-target="${escapeHtml(target)}">
              <span class="icon-chip"><span class="material-symbols-outlined">${icon}</span></span>
              <span class="docs-nav-copy">
                <strong>${escapeHtml(label)}</strong>
                <small>${escapeHtml(detail)}</small>
              </span>
            </button>
          `).join("")}
        </div>
      </aside>

      <div class="docs-content">
        ${overviewSection}
        ${presetsSection}
        ${cliSection}
        ${sdkSection}
        ${techSection}
        ${registrySection}
        ${apiSection}
        ${deploySection}
        ${errorsSection}
      </div>
    </div>
  `;
}
