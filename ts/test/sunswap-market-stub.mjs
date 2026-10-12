/**
 * A stand-in for the SunSwap market API, run as its OWN process.
 *
 * It cannot live inside the test: the golden suite drives the CLI with `spawnSync`, which blocks
 * the calling process's event loop, so a server listening there would never accept the
 * connection and every case would sit until its timeout.
 *
 * Answers the price call and fails the catalogue call, which is the arrangement that exercises
 * the degraded symbol lookup. Prints its port on the first stdout line.
 */
import { createServer } from "node:http";
import { stdout } from "node:process";

const PRICE = JSON.stringify({
  code: 0,
  data: {
    T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb: {
      quote: { USD: { last_updated: 1790150945926, price: "0.343701904777" } },
    },
  },
});

const server = createServer((req, res) => {
  if ((req.url ?? "").startsWith("/apiv2/price")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(PRICE);
    return;
  }
  res.writeHead(503);
  res.end("catalogue down");
});

server.listen(0, "127.0.0.1", () => {
  stdout.write(`${server.address().port}\n`);
});
