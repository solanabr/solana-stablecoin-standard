import React from "react";
import { Box, Text } from "ink";

interface HeaderProps {
  cluster: string;
  mintAddress: string;
}

export const Header: React.FC<HeaderProps> = ({ cluster, mintAddress }) => (
  <Box
    borderStyle="single"
    borderColor="cyan"
    paddingX={1}
    flexDirection="row"
    justifyContent="space-between"
  >
    <Text bold color="cyan">
      ◎ SSS Admin TUI
    </Text>
    <Text color="gray">
      {cluster.toUpperCase()} {mintAddress ? `| ${mintAddress.slice(0, 8)}…` : "| no mint"}
    </Text>
    <Text color="gray">q=quit  ↑↓=nav  r=refresh</Text>
  </Box>
);
