import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute, validate, meta, getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS } from '../handler.js';

function mockContext(r,c){ return {providerClient:{request:async()=>r},config:c||{timeoutMs:5000}}; }
function mockContextError(e){ return {providerClient:{request:async()=>{throw e;}},config:{timeoutMs:1000}}; }
function mockContextTimeout(){ return {providerClient:{request:async()=>{const e=new Error('aborted');e.name='AbortError';throw e;}},config:{timeoutMs:100}}; }

const sample_list_torrents = {"arguments":{"torrents":[{"id":1,"name":"ubuntu.iso","status":6,"percentDone":1}]}};
const sample_add_torrent = {"arguments":{"torrent-added":{"id":2,"name":"file.iso"}}};
const sample_remove_torrent = {"result":"success"};
const sample_get_session = {"arguments":{"download-dir":"/downloads","speed-limit-down":1000}};

describe('transmission-rpc: action validation', ()=>{ beforeEach(()=>{});
  it('reject invalid', async()=>{ const r=await execute({action:'invalid'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_ACTION'); });
  it('reject missing', async()=>{ const r=await execute({},{}); assert.equal(r.metadata.success,false); });
  it('reject null', async()=>{ const r=await execute(null,{}); assert.equal(r.metadata.success,false); });
  it('reject undefined', async()=>{ const r=await execute(undefined,{}); assert.equal(r.metadata.success,false); });
  it('list actions in error', async()=>{ const r=await execute({action:'bad'},{}); for(const a of VALID_ACTIONS) assert.ok(r.result.includes(a)); });
});

describe('transmission-rpc: PROVIDER_NOT_CONFIGURED', ()=>{ beforeEach(()=>{});
  it('fail list_torrents no client', async()=>{ const r=await execute({action:'list_torrents'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail add_torrent no client', async()=>{ const r=await execute({action:'add_torrent',url:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail remove_torrent no client', async()=>{ const r=await execute({action:'remove_torrent',torrentId:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail get_session no client', async()=>{ const r=await execute({action:'get_session'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
});

describe('transmission-rpc: list_torrents', ()=>{ beforeEach(()=>{});
  it('list_torrents success', async()=>{ const r=await execute({action:'list_torrents'},mockContext(sample_list_torrents)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'list_torrents'); });
});

describe('transmission-rpc: add_torrent', ()=>{ beforeEach(()=>{});
  it('add_torrent success', async()=>{ const r=await execute({action:'add_torrent',url:'test'},mockContext(sample_add_torrent)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'add_torrent'); });
  it('add_torrent missing param', async()=>{ const r=await execute({action:'add_torrent'},mockContext(sample_add_torrent)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('add_torrent non-string param', async()=>{ const r=await execute({action:'add_torrent',url:123},mockContext(sample_add_torrent)); assert.equal(r.metadata.success,false); });
});

describe('transmission-rpc: remove_torrent', ()=>{ beforeEach(()=>{});
  it('remove_torrent success', async()=>{ const r=await execute({action:'remove_torrent',torrentId:'test'},mockContext(sample_remove_torrent)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'remove_torrent'); });
  it('remove_torrent missing param', async()=>{ const r=await execute({action:'remove_torrent'},mockContext(sample_remove_torrent)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('remove_torrent non-string param', async()=>{ const r=await execute({action:'remove_torrent',torrentId:123},mockContext(sample_remove_torrent)); assert.equal(r.metadata.success,false); });
});

describe('transmission-rpc: get_session', ()=>{ beforeEach(()=>{});
  it('get_session success', async()=>{ const r=await execute({action:'get_session'},mockContext(sample_get_session)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_session'); });
});

describe('transmission-rpc: timeout', ()=>{ beforeEach(()=>{});
  it('timeout list_torrents', async()=>{ const r=await execute({action:'list_torrents'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout add_torrent', async()=>{ const r=await execute({action:'add_torrent',url:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout remove_torrent', async()=>{ const r=await execute({action:'remove_torrent',torrentId:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout get_session', async()=>{ const r=await execute({action:'get_session'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
});

describe('transmission-rpc: network errors', ()=>{ beforeEach(()=>{});
  it('UPSTREAM_ERROR', async()=>{ const r=await execute({action:'list_torrents'},mockContextError(new Error('fail'))); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'UPSTREAM_ERROR'); });
  it('include msg', async()=>{ const r=await execute({action:'list_torrents'},mockContextError(new Error('fail'))); assert.ok(r.result.includes('fail')); });
});

describe('transmission-rpc: getClient', ()=>{ beforeEach(()=>{});
  it('prefer provider', ()=>{ assert.equal(getClient({providerClient:{request:()=>{}},gatewayClient:{request:()=>{}}}).type,'provider'); });
  it('fallback gateway', ()=>{ assert.equal(getClient({gatewayClient:{request:()=>{}}}).type,'gateway'); });
  it('null empty', ()=>{ assert.equal(getClient({}),null); });
  it('null undef', ()=>{ assert.equal(getClient(undefined),null); });
  it('null null', ()=>{ assert.equal(getClient(null),null); });
});

describe('transmission-rpc: redactSensitive', ()=>{ beforeEach(()=>{});
  it('redact api_key', ()=>{ assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('redact bearer', ()=>{ assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('clean unchanged', ()=>{ assert.equal(redactSensitive('clean'),'clean'); });
  it('non-string', ()=>{ assert.equal(redactSensitive(42),42); });
});

describe('transmission-rpc: resolveTimeout', ()=>{ beforeEach(()=>{});
  it('default', ()=>{ assert.equal(resolveTimeout({}),DEFAULT_TIMEOUT_MS); });
  it('undef', ()=>{ assert.equal(resolveTimeout(undefined),DEFAULT_TIMEOUT_MS); });
  it('custom', ()=>{ assert.equal(resolveTimeout({config:{timeoutMs:60000}}),60000); });
  it('cap', ()=>{ assert.equal(resolveTimeout({config:{timeoutMs:999999}}),MAX_TIMEOUT_MS); });
  it('ignore 0', ()=>{ assert.equal(resolveTimeout({config:{timeoutMs:0}}),DEFAULT_TIMEOUT_MS); });
  it('ignore neg', ()=>{ assert.equal(resolveTimeout({config:{timeoutMs:-1}}),DEFAULT_TIMEOUT_MS); });
  it('ignore str', ()=>{ assert.equal(resolveTimeout({config:{timeoutMs:'x'}}),DEFAULT_TIMEOUT_MS); });
  it('D=30000', ()=>{ assert.equal(DEFAULT_TIMEOUT_MS,30000); });
  it('M=120000', ()=>{ assert.equal(MAX_TIMEOUT_MS,120000); });
});

describe('transmission-rpc: validate()', ()=>{ beforeEach(()=>{});
  it('reject invalid', ()=>{ assert.equal(validate({action:'bad'}).valid,false); });
  it('reject null', ()=>{ assert.equal(validate(null).valid,false); });
  it('list_torrents valid no params', ()=>{ assert.equal(validate({action:'list_torrents'}).valid,true); });
  it('add_torrent req params', ()=>{ assert.equal(validate({action:'add_torrent'}).valid,false); assert.equal(validate({action:'add_torrent',url:'t'}).valid,true); });
  it('remove_torrent req params', ()=>{ assert.equal(validate({action:'remove_torrent'}).valid,false); assert.equal(validate({action:'remove_torrent',torrentId:'t'}).valid,true); });
  it('get_session valid no params', ()=>{ assert.equal(validate({action:'get_session'}).valid,true); });
});

describe('transmission-rpc: meta', ()=>{ beforeEach(()=>{});
  it('name', ()=>{ assert.equal(meta.name,'transmission-rpc'); });
  it('version', ()=>{ assert.equal(meta.version,'1.0.0'); });
  it('actions count', ()=>{ assert.equal(meta.actions.length,4); });
});

describe('transmission-rpc: gateway fallback', ()=>{ beforeEach(()=>{});
  it('use gateway', async()=>{ const ctx={gatewayClient:{request:async()=>sample_list_torrents},config:{timeoutMs:5000}}; const r=await execute({action:'list_torrents'},ctx); assert.equal(r.metadata.success,true); });
});

describe('transmission-rpc: providerNotConfiguredError', ()=>{ beforeEach(()=>{});
  it('success false', ()=>{ assert.equal(providerNotConfiguredError().metadata.success,false); });
  it('code', ()=>{ assert.equal(providerNotConfiguredError().metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('retriable false', ()=>{ assert.equal(providerNotConfiguredError().metadata.error.retriable,false); });
});

describe('transmission-rpc: constants', ()=>{ beforeEach(()=>{});
  it('VALID_ACTIONS', ()=>{ assert.deepEqual(VALID_ACTIONS,['list_torrents','add_torrent','remove_torrent','get_session']); });
});

describe('transmission-rpc: request paths', ()=>{ beforeEach(()=>{});
  it('path list_torrents', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_list_torrents;}},config:{timeoutMs:5000}}; await execute({action:'list_torrents'},ctx); assert.ok(p!==null); });
  it('path add_torrent', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_add_torrent;}},config:{timeoutMs:5000}}; await execute({action:'add_torrent',url:'test'},ctx); assert.ok(p!==null); });
  it('path remove_torrent', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_remove_torrent;}},config:{timeoutMs:5000}}; await execute({action:'remove_torrent',torrentId:'test'},ctx); assert.ok(p!==null); });
  it('path get_session', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_session;}},config:{timeoutMs:5000}}; await execute({action:'get_session'},ctx); assert.ok(p!==null); });
});
