/** Child-process RPC fixture: the test payer already has enough Permit2 allowance. */
export const tronAllowancePreload = `
import {createServer as createAllowanceRpc} from 'node:http';
import {writeFileSync as writeAllowanceConfig} from 'node:fs';
import {join as allowancePath} from 'node:path';
const allowanceRpc = createAllowanceRpc((request, response) => {
  request.resume();
  response.setHeader('content-type', 'application/json');
  if(request.url !== '/wallet/triggerconstantcontract') {
    response.writeHead(500); response.end('{}'); return;
  }
  response.end(JSON.stringify({result:{result:true}, constant_result:['f'.repeat(64)]}));
});
await new Promise(resolve => allowanceRpc.listen(0, '127.0.0.1', resolve));
allowanceRpc.unref();
writeAllowanceConfig(allowancePath(process.env.WALLET_CLI_HOME, 'config.yaml'),
  'networks:\\n  "tron:3448148188":\\n    httpEndpoint: "http://127.0.0.1:' + allowanceRpc.address().port + '"\\n');
`;
