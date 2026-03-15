import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/solana-stablecoin-standard-pre/',
    component: ComponentCreator('/solana-stablecoin-standard-pre/', '05a'),
    routes: [
      {
        path: '/solana-stablecoin-standard-pre/',
        component: ComponentCreator('/solana-stablecoin-standard-pre/', '7f5'),
        routes: [
          {
            path: '/solana-stablecoin-standard-pre/',
            component: ComponentCreator('/solana-stablecoin-standard-pre/', '269'),
            routes: [
              {
                path: '/solana-stablecoin-standard-pre/architecture/compliance',
                component: ComponentCreator('/solana-stablecoin-standard-pre/architecture/compliance', 'c8e'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/architecture/instructions',
                component: ComponentCreator('/solana-stablecoin-standard-pre/architecture/instructions', '998'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/architecture/overview',
                component: ComponentCreator('/solana-stablecoin-standard-pre/architecture/overview', 'e11'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/guides/attestations',
                component: ComponentCreator('/solana-stablecoin-standard-pre/guides/attestations', '6b8'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/guides/blacklist',
                component: ComponentCreator('/solana-stablecoin-standard-pre/guides/blacklist', 'b3f'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/guides/mint-burn',
                component: ComponentCreator('/solana-stablecoin-standard-pre/guides/mint-burn', '868'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/guides/roles',
                component: ComponentCreator('/solana-stablecoin-standard-pre/guides/roles', '937'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/guides/transfer-hook',
                component: ComponentCreator('/solana-stablecoin-standard-pre/guides/transfer-hook', '07c'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/installation',
                component: ComponentCreator('/solana-stablecoin-standard-pre/installation', 'd88'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/llm/agent-guide',
                component: ComponentCreator('/solana-stablecoin-standard-pre/llm/agent-guide', '041'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/quickstart',
                component: ComponentCreator('/solana-stablecoin-standard-pre/quickstart', '67d'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/sdk/client',
                component: ComponentCreator('/solana-stablecoin-standard-pre/sdk/client', '75a'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/sdk/constants',
                component: ComponentCreator('/solana-stablecoin-standard-pre/sdk/constants', 'ee1'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/sdk/errors',
                component: ComponentCreator('/solana-stablecoin-standard-pre/sdk/errors', '47e'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/sdk/events',
                component: ComponentCreator('/solana-stablecoin-standard-pre/sdk/events', '2e4'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/sdk/oracle',
                component: ComponentCreator('/solana-stablecoin-standard-pre/sdk/oracle', '263'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/sdk/pda',
                component: ComponentCreator('/solana-stablecoin-standard-pre/sdk/pda', '592'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/sdk/presets',
                component: ComponentCreator('/solana-stablecoin-standard-pre/sdk/presets', '12c'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/sdk/types',
                component: ComponentCreator('/solana-stablecoin-standard-pre/sdk/types', 'c58'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/solana-stablecoin-standard-pre/',
                component: ComponentCreator('/solana-stablecoin-standard-pre/', 'aab'),
                exact: true,
                sidebar: "docsSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
