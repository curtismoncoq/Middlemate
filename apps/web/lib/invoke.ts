import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export function publicAddress(address: string): boolean {
  if (isIP(address) === 6) return /^[23][0-9a-f]{0,3}:/i.test(address);
  if (isIP(address) !== 4) return false;
  const [a,b] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
}

/** Pin validated DNS to the socket; never forward cookies or follow provider redirects. */
export async function invokeProvider(endpoint: string, body: string, headers: Record<string,string>): Promise<{status:number; headers:Headers; body:string}> {
  const url = new URL(endpoint);
  if (url.username || url.password) throw new Error('Endpoint credentials in URLs are unsupported.');
  const loopback = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  const localDemo = loopback && url.protocol === 'http:' && (
    (/^400[3-6]$/.test(url.port) && url.pathname === '/weather/v1/forecast') ||
    (url.port === '4001' && /^\/(minimax-a|llama-b|cheapmax)\/v1\/chat\/completions$/.test(url.pathname))
  );
  if (!localDemo && (url.protocol !== 'https:' || (url.port && url.port !== '443'))) throw new Error('Use a public HTTPS endpoint or a documented local demo endpoint.');
  const addresses = localDemo ? [{ address: url.hostname === '[::1]' ? '::1' : '127.0.0.1', family: url.hostname === '[::1]' ? 6 : 4 }] : await lookup(url.hostname, { all: true });
  if (!addresses.length || (!localDemo && addresses.some((entry) => !publicAddress(entry.address)))) throw new Error('Private network endpoints are unavailable through the marketplace gateway.');
  const selected = addresses[0];
  return new Promise((resolve,reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'POST', headers,
      lookup: (_hostname, options, callback) => options.all ? callback(null, [selected]) : callback(null, selected.address, selected.family),
    }, (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) { request.destroy(new Error('Provider response exceeds 2 MB.')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        const status = response.statusCode ?? 502;
        if (status >= 300 && status < 400) { reject(new Error('Provider redirects are unsupported.')); return; }
        const returned = new Headers();
        for (const name of ['content-type','payment-required','payment-response','x-payment-response']) {
          const value = response.headers[name];
          if (typeof value === 'string') returned.set(name,value);
        }
        resolve({ status, headers: returned, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    request.setTimeout(60000, () => request.destroy(new Error('Provider request timed out.')));
    request.on('error', reject);
    request.end(body);
  });
}
