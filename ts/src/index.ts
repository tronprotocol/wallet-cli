import { main } from "./app/runner/index.js";

main(process.argv)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    // last-resort guard; Runner normally funnels all errors itself
    process.stderr.write(`fatal: ${e?.message ?? String(e)}\n`);
    process.exitCode = 1;
  });
