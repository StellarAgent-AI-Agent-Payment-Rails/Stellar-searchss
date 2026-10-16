// Run by CI as `npx tsx --test tests/parity.test.ts`, i.e. under node:test —
// not Vitest. Importing from 'vitest' here throws "Vitest failed to access its
// internal state" outside a Vitest worker.
import { describe, test, before as before, after as after } from 'node:test';
import assert from 'node:assert';
import http, { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// server/index.ts only calls app.listen() when NODE_ENV is neither
// 'production' nor 'test', so pin it before the import to keep the port free.
process.env.NODE_ENV = 'test';

// server/index.ts constructs the Groq client at module scope and throws
// without a key, so supply placeholders. The parity cases below never reach
// Groq; they only compare Express and serverless responses with each other.
process.env.GROQ_API_KEY ||= 'test-groq-key';
process.env.SERPER_API_KEY ||= 'test-serper-key';
process.env.STELLAR_RECEIVING_ADDRESS ||=
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';


const { createApp } = await import('../server/app');
const healthHandler = (await import('../api/health')).default;
const searchHandler = (await import('../api/search')).default;

type ServerlessHandler = (req: any, res: any) => unknown;

type ParityCase = {
  name: string;
  method: 'GET' | 'POST';
  expressPath: string;
  serverlessPath: string;
  handler: ServerlessHandler;
  compareFields: string[];
  body?: unknown;
  headers?: Record<string, string>;
};

const cases: ParityCase[] = [
  {
    name: 'health happy path',
    method: 'GET',
    expressPath: '/health',
    serverlessPath: '/api/health',
    handler: healthHandler,
    compareFields: [
      'status',
      'version',
      'network',
      'pricePerQuery',
      'protocol',
      'facilitator',
      'serperApiConfigured',
      'groqApiConfigured',
      'receivingAddressConfigured',
    ],
  },
  {
    name: 'search happy path',
    method: 'GET',
    expressPath: '/search?q=Stellar+blockchain',
    serverlessPath: '/api/search?q=Stellar+blockchain',
    handler: searchHandler,
    compareFields: [],
  },
  {
    name: 'search missing query',
    method: 'GET',
    expressPath: '/search',
    serverlessPath: '/api/search',
    handler: searchHandler,
    compareFields: [],
  },
  {
    name: 'search empty query',
    method: 'GET',
    expressPath: '/search?q=',
    serverlessPath: '/api/search?q=',
    handler: searchHandler,
    compareFields: [],
  },
];

interface ResponseSnapshot {
  status: number;
  body: unknown;
}

function normalizeBody(raw: string, contentType: string | undefined): unknown {
  if (contentType && contentType.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  if (raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function listen(server: Server): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to bind test server'));
        return;
      }
      resolve(addr);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function callExpress(
  baseUrl: string,
  testCase: ParityCase,
): Promise<ResponseSnapshot> {
  const headers: Record<string, string> = { ...testCase.headers };
  let body: string | undefined;
  if (testCase.body !== undefined) {
    body = typeof testCase.body === 'string' ? testCase.body : JSON.stringify(testCase.body);
  }
  const res = await fetch(new URL(testCase.expressPath, baseUrl), {
    method: testCase.method,
    headers,
    body,
  });
  const raw = await res.text();
  return {
    status: res.status,
    body: normalizeBody(raw, res.headers.get('content-type') ?? undefined),
  };
}

async function callServerless(testCase: ParityCase): Promise<ResponseSnapshot> {
  const url = new URL(testCase.serverlessPath, 'http://localhost');
  const headers: Record<string, string> = { ...testCase.headers };
  let body: string | undefined;
  if (testCase.body !== undefined) {
    body = typeof testCase.body === 'string' ? testCase.body : JSON.stringify(testCase.body);
  }

  const req = {
    method: testCase.method,
    url: url.pathname + url.search,
    headers,
    body,
    query: Object.fromEntries(url.searchParams.entries()),
  };

  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    json(data: unknown) {
      this.body = JSON.stringify(data);
      return this;
    },
    send(data: unknown) {
      this.body = typeof data === 'string' ? data : JSON.stringify(data);
      return this;
    },
    end(data?: unknown) {
      if (data !== undefined) {
        this.body = typeof data === 'string' ? data : JSON.stringify(data);
      }
      return this;
    },
  };

  await testCase.handler(req, res);

  const contentType = res.headers['content-type'];
  return { status: res.statusCode, body: normalizeBody(res.body, contentType) };
}

describe('parity between Express and serverless handlers', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp();
    server = http.createServer(app);
    const addr = await listen(server);
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (server) await close(server);
  });

  for (const testCase of cases) {
    test(`the Express and serverless handlers agree on ${testCase.name}`, async () => {
      const [expressResponse, serverlessResponse] = await Promise.all([
        callExpress(baseUrl, testCase),
        callServerless(testCase),
      ]);

      assert.strictEqual(
        serverlessResponse.status,
        expressResponse.status,
        `status code diverged for ${testCase.name}: Express = ${expressResponse.status}, serverless = ${serverlessResponse.status}`,
      );
      const comparableBody = (body: unknown) => {
        if (!body || typeof body !== 'object') return body;
        const values = body as Record<string, unknown>;
        return Object.fromEntries(
          testCase.compareFields.map((field) => [field, values[field]]),
        );
      };
      assert.deepStrictEqual(
        comparableBody(serverlessResponse.body),
        comparableBody(expressResponse.body),
        `response body diverged for ${testCase.name}`,
      );
    });
  }
});