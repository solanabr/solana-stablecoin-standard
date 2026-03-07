import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  message: string;
  cluster: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({ message }) => (
  <Box borderStyle="single" borderColor="gray" paddingX={1}>
    <Text color="gray">{message}</Text>
  </Box>
);
