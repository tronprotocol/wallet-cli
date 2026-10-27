// Run separately because the test process blocks on spawnSync.
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
