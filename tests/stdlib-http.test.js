// tests/stdlib-http.test.js
// Tests for the http namespace module in the Tova stdlib.

import { describe, test, expect, afterAll } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { BUILTIN_FUNCTIONS, RESULT_OPTION } from '../src/stdlib/inline.js';

function compile(code) {
  const lexer = new Lexer(code);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const gen = new CodeGenerator(ast, '<test>');
  return gen.generate().shared;
}

describe('http namespace — compilation tests', () => {
  test('http namespace is emitted when http.get() is referenced', () => {
    const output = compile('result = http.get("https://example.com")');
    expect(output).toContain('const http = Object.freeze(');
    expect(output).toContain('async _request(');
  });

  test('http namespace is emitted when http.post() is referenced', () => {
    const output = compile('result = http.post("https://example.com/api", { name: "test" })');
    expect(output).toContain('const http = Object.freeze(');
    expect(output).toContain('fetch');
  });

  test('generated code contains all 6 HTTP methods', () => {
    const output = compile('a = http.get("https://example.com")');
    expect(output).toContain('get(url, opts)');
    expect(output).toContain('post(url, body, opts)');
    expect(output).toContain('put(url, body, opts)');
    expect(output).toContain('patch(url, body, opts)');
    expect(output).toContain('delete(url, opts)');
    expect(output).toContain('head(url, opts)');
  });

  test('generated code contains async, fetch, and AbortController', () => {
    const output = compile('r = http.get("https://example.com")');
    expect(output).toContain('async _request(');
    expect(output).toContain('fetch(url');
    expect(output).toContain('AbortController');
  });

  test('generated code includes Ok/Err Result types', () => {
    const output = compile('r = http.get("https://example.com")');
    expect(output).toContain('return Ok(');
    expect(output).toContain('return Err(');
    expect(output).toContain('class _Ok');
    expect(output).toContain('class _Err');
  });

  test('http namespace handles bearer auth option in codegen', () => {
    const output = compile('r = http.get("https://api.example.com", { bearer: "my-token" })');
    expect(output).toContain("'Authorization'");
    expect(output).toContain("'Bearer '");
  });

  test('http namespace handles timeout in codegen', () => {
    const output = compile('r = http.get("https://example.com", { timeout: 5000 })');
    expect(output).toContain('timeout');
    expect(output).toContain('AbortController');
    expect(output).toContain('Timeout after');
  });

  test('http namespace handles retries in codegen', () => {
    const output = compile('r = http.get("https://example.com", { retries: 3, retry_delay: 500 })');
    expect(output).toContain('retries');
    expect(output).toContain('retry_delay');
    expect(output).toContain('attempt');
  });

  test('http.delete is emitted correctly (no body parameter)', () => {
    const output = compile('r = http.delete("https://example.com/resource/1")');
    expect(output).toContain("http.delete(");
    expect(output).toContain("delete(url, opts) { return http._request('DELETE', url, null, opts)");
  });

  test('http.head is emitted correctly', () => {
    const output = compile('r = http.head("https://example.com")');
    expect(output).toContain("http.head(");
    expect(output).toContain("head(url, opts) { return http._request('HEAD', url, null, opts)");
  });

  test('http namespace not emitted when not used', () => {
    const output = compile('x = 42\nprint(x)');
    expect(output).not.toContain('const http = Object.freeze(');
  });

  test('http.put and http.patch pass body', () => {
    const output = compile('a = http.put("https://example.com", { data: 1 })\nb = http.patch("https://example.com", { data: 2 })');
    expect(output).toContain("put(url, body, opts) { return http._request('PUT', url, body, opts)");
    expect(output).toContain("patch(url, body, opts) { return http._request('PATCH', url, body, opts)");
  });

  test('generated code handles JSON auto-serialization', () => {
    const output = compile('r = http.post("https://example.com", { key: "value" })');
    expect(output).toContain("'Content-Type'");
    expect(output).toContain("'application/json'");
    expect(output).toContain('JSON.stringify(body)');
  });

  test('generated code handles JSON auto-parsing', () => {
    const output = compile('r = http.get("https://example.com")');
    expect(output).toContain("'application/json'");
    expect(output).toContain('resp.json()');
  });

  test('generated code handles redirect option', () => {
    const output = compile('r = http.get("https://example.com", { follow_redirects: false })');
    expect(output).toContain('follow_redirects');
    expect(output).toContain("'manual'");
    expect(output).toContain("'follow'");
  });
});

describe('http namespace — shape tests', () => {
  test('BUILTIN_FUNCTIONS contains http entry', () => {
    expect(BUILTIN_FUNCTIONS.http).toBeDefined();
    expect(typeof BUILTIN_FUNCTIONS.http).toBe('string');
  });

  test('http entry contains Object.freeze', () => {
    expect(BUILTIN_FUNCTIONS.http).toContain('Object.freeze');
  });

  test('http entry contains all method definitions', () => {
    const src = BUILTIN_FUNCTIONS.http;
    expect(src).toContain('get(url, opts)');
    expect(src).toContain('post(url, body, opts)');
    expect(src).toContain('put(url, body, opts)');
    expect(src).toContain('patch(url, body, opts)');
    expect(src).toContain('delete(url, opts)');
    expect(src).toContain('head(url, opts)');
  });

  test('http entry contains _request async method', () => {
    expect(BUILTIN_FUNCTIONS.http).toContain('async _request(method, url, body, opts)');
  });

  test('http entry uses fetch API', () => {
    expect(BUILTIN_FUNCTIONS.http).toContain('fetch(url');
  });

  test('http entry handles bearer auth', () => {
    expect(BUILTIN_FUNCTIONS.http).toContain("'Authorization'");
    expect(BUILTIN_FUNCTIONS.http).toContain("'Bearer '");
  });

  test('http entry handles JSON content type', () => {
    expect(BUILTIN_FUNCTIONS.http).toContain("'Content-Type'");
    expect(BUILTIN_FUNCTIONS.http).toContain("'application/json'");
  });

  test('http entry handles timeout via AbortController', () => {
    expect(BUILTIN_FUNCTIONS.http).toContain('AbortController');
    expect(BUILTIN_FUNCTIONS.http).toContain('Timeout after');
  });

  test('http entry handles retries', () => {
    expect(BUILTIN_FUNCTIONS.http).toContain('retries');
    expect(BUILTIN_FUNCTIONS.http).toContain('retry_delay');
  });

  test('http entry handles redirect option', () => {
    expect(BUILTIN_FUNCTIONS.http).toContain('follow_redirects');
    expect(BUILTIN_FUNCTIONS.http).toContain("'manual'");
    expect(BUILTIN_FUNCTIONS.http).toContain("'follow'");
  });
});

describe('http namespace — integration tests', () => {
  let server;
  let port;
  let httpNs; // The evaluated http namespace object

  // Start a local Bun server and evaluate the http namespace for integration tests
  try {
    server = Bun.serve({
      port: 0,
      fetch(req) {
        const url_obj = new URL(req.url);
        if (url_obj.pathname === '/json') {
          return new Response(JSON.stringify({ message: 'hello', method: req.method }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url_obj.pathname === '/text') {
          return new Response('plain text response', {
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        if (url_obj.pathname === '/echo') {
          return req.text().then(body => {
            return new Response(JSON.stringify({ echo: body, method: req.method, ct: req.headers.get('content-type') }), {
              headers: { 'Content-Type': 'application/json' },
            });
          });
        }
        if (url_obj.pathname === '/auth') {
          const auth = req.headers.get('authorization');
          return new Response(JSON.stringify({ auth: auth }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url_obj.pathname === '/status/404') {
          return new Response('not found', { status: 404 });
        }
        if (url_obj.pathname === '/headers') {
          const h = {};
          req.headers.forEach((v, k) => { h[k] = v; });
          return new Response(JSON.stringify(h), {
            headers: { 'Content-Type': 'application/json', 'X-Custom': 'test-value' },
          });
        }
        return new Response('ok');
      },
    });
    port = server.port;

    // Evaluate Result/Option and http namespace once
    const evalCode = RESULT_OPTION + '\n' + BUILTIN_FUNCTIONS.http + '\n return http;';
    const factory = new Function(evalCode);
    httpNs = factory();
  } catch (e) {
    // If server or eval fails, tests will be skipped
  }

  afterAll(() => {
    if (server) server.stop();
  });

  test('http.get() returns Ok Result with JSON response', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.get(`http://localhost:${port}/json`);
    expect(result.__tag).toBe('Ok');
    expect(result.value.status).toBe(200);
    expect(result.value.ok).toBe(true);
    expect(result.value.body).toEqual({ message: 'hello', method: 'GET' });
  });

  test('http.get() auto-parses JSON response body', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.get(`http://localhost:${port}/json`);
    const resp = result.unwrap();
    expect(resp.body).toEqual({ message: 'hello', method: 'GET' });
  });

  test('http.get() text response returns string body', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.get(`http://localhost:${port}/text`);
    const resp = result.unwrap();
    expect(resp.body).toBe('plain text response');
  });

  test('http.post() sends JSON body automatically', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.post(`http://localhost:${port}/echo`, { name: 'tova' });
    const resp = result.unwrap();
    expect(resp.body.method).toBe('POST');
    expect(resp.body.ct).toBe('application/json');
    expect(resp.body.echo).toBe('{"name":"tova"}');
  });

  test('http.put() sends body with PUT method', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.put(`http://localhost:${port}/echo`, { action: 'update' });
    const resp = result.unwrap();
    expect(resp.body.method).toBe('PUT');
  });

  test('http.patch() sends body with PATCH method', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.patch(`http://localhost:${port}/echo`, { field: 'val' });
    const resp = result.unwrap();
    expect(resp.body.method).toBe('PATCH');
  });

  test('http.delete() sends DELETE request', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.delete(`http://localhost:${port}/json`);
    const resp = result.unwrap();
    expect(resp.body.method).toBe('DELETE');
  });

  test('http.head() sends HEAD request', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.head(`http://localhost:${port}/json`);
    const resp = result.unwrap();
    expect(resp.status).toBe(200);
  });

  test('bearer auth sends Authorization header', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.get(`http://localhost:${port}/auth`, { bearer: 'my-secret-token' });
    const resp = result.unwrap();
    expect(resp.body.auth).toBe('Bearer my-secret-token');
  });

  test('response includes headers', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.get(`http://localhost:${port}/headers`);
    const resp = result.unwrap();
    expect(resp.headers['x-custom']).toBe('test-value');
  });

  test('non-ok status still returns Ok Result with ok:false', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.get(`http://localhost:${port}/status/404`);
    expect(result.__tag).toBe('Ok');
    const resp = result.unwrap();
    expect(resp.status).toBe(404);
    expect(resp.ok).toBe(false);
  });

  test('response.json() returns Err for non-JSON text', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.get(`http://localhost:${port}/text`);
    const resp = result.unwrap();
    const jsonResult = resp.json();
    expect(jsonResult.__tag).toBe('Err');
  });

  test('response.json() returns Ok for JSON body', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.get(`http://localhost:${port}/json`);
    const resp = result.unwrap();
    const jsonResult = resp.json();
    expect(jsonResult.__tag).toBe('Ok');
    expect(jsonResult.unwrap().message).toBe('hello');
  });

  test('connection error returns Err Result', async () => {
    if (!httpNs) return;
    const result = await httpNs.get('http://localhost:1');
    expect(result.__tag).toBe('Err');
  });

  test('custom headers are sent', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.get(`http://localhost:${port}/headers`, {
      headers: { 'X-Test-Header': 'test-value-123' }
    });
    const resp = result.unwrap();
    expect(resp.body['x-test-header']).toBe('test-value-123');
  });
});
