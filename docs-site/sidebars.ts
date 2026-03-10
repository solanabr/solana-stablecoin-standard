import type {SidebarsConfig} from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [
    "intro",
    {
      type: "category",
      label: "Getting Started",
      items: ["quickstart", "installation"],
    },
    {
      type: "category",
      label: "SDK Reference",
      items: [
        "sdk/client",
        "sdk/types",
        "sdk/pda",
        "sdk/presets",
        "sdk/errors",
        "sdk/events",
        "sdk/oracle",
        "sdk/constants",
      ],
    },
    {
      type: "category",
      label: "Program Architecture",
      items: [
        "architecture/overview",
        "architecture/instructions",
        "architecture/compliance",
      ],
    },
    {
      type: "category",
      label: "Guides",
      items: [
        "guides/mint-burn",
        "guides/blacklist",
        "guides/roles",
        "guides/attestations",
        "guides/transfer-hook",
      ],
    },
    {
      type: "category",
      label: "For LLM Agents",
      items: ["llm/agent-guide"],
    },
  ],
};

export default sidebars;
