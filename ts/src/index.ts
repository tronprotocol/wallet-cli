import { main } from "./bootstrap/runner.js";
import { reportFatal } from "./adapters/inbound/cli/output/fatal.js";

main(process.argv)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    process.exitCode = reportFatal(e);
  });
