/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
    {
      type: 'doc',
      id: 'guide/introduction',
      label: 'Introduction',
    },
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'guide/getting-started',
        'guide/quickstart',
      ],
    },
    {
      type: 'category',
      label: 'Core Concepts',
      collapsed: false,
      items: [
        'guide/architecture',
        'guide/token-standards',
        'guide/compliance-security',
      ],
    },
    {
      type: 'category',
      label: 'Presets',
      items: [
        'presets/sss-1',
        'presets/sss-2',
        'presets/sss-3',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'guide/sdk-cli',
        'guide/instructions-reference',
      ],
    },
    {
      type: 'category',
      label: 'Operations',
      items: [
        'guide/deployment',
        'guide/operations-runbook',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'guide/faq',
        'reference/glossary',
      ],
    },
  ],
};

module.exports = sidebars;
