// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Solana Stablecoin Standard',
  tagline: 'The definitive framework for regulated stablecoins on Solana',
  favicon: 'img/favicon.ico',

  url: 'https://sss.solana.com',
  baseUrl: '/',

  organizationName: 'Rahul-Prasad-07',
  projectName: 'solana-stablecoin-standard',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  // Enable Mermaid diagrams
  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/Rahul-Prasad-07/solana-stablecoin-standard/tree/sss/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/sss-social-card.jpg',
      navbar: {
        title: 'SSS',
        logo: {
          alt: 'Solana Stablecoin Standard Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Documentation',
          },
          {
            to: '/docs/guide/instructions-reference',
            label: 'API',
            position: 'left',
          },
          {
            to: '/docs/guide/token-standards',
            label: 'Standards',
            position: 'left',
          },
          {
            href: 'https://github.com/Rahul-Prasad-07/solana-stablecoin-standard',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Documentation',
            items: [
              { label: 'Getting Started', to: '/docs/guide/getting-started' },
              { label: 'Architecture', to: '/docs/guide/architecture' },
              { label: 'SDK Reference', to: '/docs/guide/sdk-cli' },
            ],
          },
          {
            title: 'Standards',
            items: [
              { label: 'Standards Overview', to: '/docs/guide/token-standards' },
              { label: 'Compliance and Security', to: '/docs/guide/compliance-security' },
              { label: 'Operations Runbook', to: '/docs/guide/operations-runbook' },
            ],
          },
          {
            title: 'Community',
            items: [
              { label: 'Discord', href: 'https://discord.gg/solana' },
              { label: 'Twitter', href: 'https://twitter.com/solana' },
              { label: 'GitHub', href: 'https://github.com/Rahul-Prasad-07/solana-stablecoin-standard' },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Solana Stablecoin Standard. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['rust', 'toml', 'bash', 'json'],
      },
      mermaid: {
        theme: { light: 'neutral', dark: 'dark' },
      },
    }),
};

export default config;
