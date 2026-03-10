import type {Config} from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const isVercel = process.env.VERCEL === "1";

const config: Config = {
  title: "Solana Stablecoin Standard",
  tagline: "Compliance-ready Token-2022 stablecoins for Solana",
  favicon: "img/sss-mark.svg",

  url: isVercel
    ? (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "https://solana-stablecoin-standard.vercel.app")
    : "https://amanhij.github.io",
  baseUrl: isVercel ? "/" : "/solana-stablecoin-standard-pre/",

  organizationName: "amanhij",
  projectName: "solana-stablecoin-standard-pre",
  deploymentBranch: "gh-pages",
  trailingSlash: false,

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  headTags: [
    {
      tagName: "meta",
      attributes: {
        name: "theme-color",
        content: "#030303",
      },
    },
  ],

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl:
            "https://github.com/amanhij/solana-stablecoin-standard-pre/tree/main/docs-site/",
        },
        blog: false,
        pages: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/sss-mark.svg",
    navbar: {
      title: "SSS",
      logo: {
        alt: "SSS",
        src: "img/sss-mark.svg",
      },
      items: [
        {
          type: "doc",
          docId: "intro",
          label: "Docs",
          position: "left",
        },
        {
          href: "https://www.npmjs.com/package/solana-stablecoin-standard",
          label: "npm",
          position: "right",
        },
        {
          href: "https://github.com/amanhij/solana-stablecoin-standard-pre",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Quickstart",
              to: "/quickstart",
            },
            {
              label: "SDK Client",
              to: "/sdk/client",
            },
            {
              label: "Architecture",
              to: "/architecture/overview",
            },
          ],
        },
        {
          title: "Project",
          items: [
            {
              label: "Repository",
              href: "https://github.com/amanhij/solana-stablecoin-standard-pre",
            },
            {
              label: "SDK Package",
              href: "https://www.npmjs.com/package/solana-stablecoin-standard",
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Solana Stablecoin Standard`,
    },
    colorMode: {
      defaultMode: "dark",
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    docs: {
      sidebar: {
        hideable: true,
      },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
