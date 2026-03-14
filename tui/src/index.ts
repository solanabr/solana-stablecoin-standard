#!/usr/bin/env node

import { runApp } from "./app";

runApp().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
