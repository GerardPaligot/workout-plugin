import net from 'node:net';

export class RemoteError extends Error {
  constructor(code, retryAt) { super(code); this.code = code; this.retryAt = retryAt; }
}

export function endpoint(config) {
  const url = new URL(config.endpoint);
  if (url.username || url.password || url.search || url.hash) throw new Error('Invalid endpoint');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const ip = net.isIP(host);
  const privateHost = host === 'localhost' || host === '::1' || (ip === 4 && (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)));
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && config.trustedPrivateHttp === true && privateHost)) throw new Error('Endpoint requires HTTPS or explicitly trusted private HTTP');
  url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  return url;
}

export class Client {
  constructor(config) {
    this.base = endpoint(config);
    this.token = process.env[config.tokenEnv || 'OPENGYM_TOKEN'];
    if (!this.token) throw new Error('Missing token environment variable');
    this.id = 0;
  }
  async request(path, options = {}) {
    let response;
    try {
      response = await fetch(new URL(path, this.base), { ...options, redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { authorization: `Bearer ${this.token}`, ...options.headers } });
    } catch { throw new RemoteError('network_uncertain'); }
    if (response.status === 429) {
      const value = response.headers.get('retry-after');
      const seconds = value === null || value.trim() === '' ? NaN : Number(value);
      const parsed = value && !Number.isFinite(seconds) ? Date.parse(value) : NaN;
      throw new RemoteError('rate_limited', new Date(Number.isFinite(parsed) ? parsed : Date.now() + (Number.isFinite(seconds) && seconds >= 0 ? seconds : 60) * 1000).toISOString());
    }
    if (!response.ok) throw new RemoteError(`http_${response.status}`);
    if (response.status === 204 || response.status === 202) return null;
    if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new RemoteError('invalid_content_type');
    try { return await response.json(); } catch { throw new RemoteError('invalid_json'); }
  }
  async identity() { return this.request('api/token/me'); }
  async rpc(method, params, notification = false) {
    const id = ++this.id;
    const body = { jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(!notification ? { id } : {}) };
    let result;
    try { result = await this.request('mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(this.protocol ? { 'mcp-protocol-version': this.protocol } : {}) }, body: JSON.stringify(body) }); }
    catch (error) { if (notification && error.code === 'invalid_content_type') return; throw error; }
    if (notification) return;
    if (result.jsonrpc !== '2.0' || result.id !== id || result.error || !result.result) throw new RemoteError('rpc_error');
    return result.result;
  }
  async initialize() {
    const result = await this.rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'workout-opengym', version: '1.0.0' } });
    if (typeof result.protocolVersion !== 'string') throw new RemoteError('invalid_protocol');
    this.protocol = result.protocolVersion;
    await this.rpc('notifications/initialized', null, true);
    const list = await this.rpc('tools/list');
    if (!Array.isArray(list.tools) || list.tools.some(tool => typeof tool.name !== 'string' || !tool.inputSchema || tool.inputSchema.type !== 'object' || (tool.inputSchema.properties != null && (typeof tool.inputSchema.properties !== 'object' || Array.isArray(tool.inputSchema.properties))))) throw new RemoteError('invalid_tools');
    return list.tools;
  }
  async call(name, args = {}) {
    const result = await this.rpc('tools/call', { name, arguments: args });
    if (result.isError) {
      const text = result.content?.length === 1 && result.content[0]?.type === 'text' ? result.content[0].text : '';
      if (typeof text === 'string' && text.startsWith('ERATE: ')) {
        const seconds = result.retryAfter;
        throw new RemoteError('native_rate_limited', new Date(Date.now() + (Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 3600000)).toISOString());
      }
      throw new RemoteError('tool_error');
    }
    const texts = result.content?.filter(item => item.type === 'text');
    if (texts?.length !== 1) throw new RemoteError('invalid_tool_content');
    try { const data = JSON.parse(texts[0].text); if (!data || typeof data !== 'object') throw 0; return data; } catch { throw new RemoteError('invalid_tool_content'); }
  }
}
