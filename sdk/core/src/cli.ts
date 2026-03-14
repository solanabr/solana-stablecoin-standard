#!/usr/bin/env node

import { createCli } from "./cli/index";

const program = createCli();
program.parse();

