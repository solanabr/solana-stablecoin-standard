process.env.SOLANA_CLUSTER ??= "devnet";
process.env.MOCHA_COLORS ??= "1";

import { writeReport } from "./helpers/run-report";

after(function () {
  writeReport();
});
