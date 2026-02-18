import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute, validate, meta, getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS } from '../handler.js';

function mockContext(r,c){ return {providerClient:{request:async()=>r},config:c||{timeoutMs:5000}}; }
function mockContextError(e){ return {providerClient:{request:async()=>{throw e;}},config:{timeoutMs:1000}}; }
function mockContextTimeout(){ return {providerClient:{request:async()=>{const e=new Error('aborted');e.name='AbortError';throw e;}},config:{timeoutMs:100}}; }

const sample_get_libraries = {"MediaContainer":{"Directory":[{"key":"1","title":"Movies","type":"movie"}]}};
const sample_search_media = {"MediaContainer":{"Metadata":[{"title":"Inception","year":2010}]}};
const sample_get_recently_added = {"MediaContainer":{"Metadata":[{"title":"New Movie","addedAt":1700000000}]}};
const sample_get_sessions = {"MediaContainer":{"Metadata":[{"title":"Playing Movie","User":{"title":"John"}}]}};

describe('plex-api: action validation', ()=>{ beforeEach(()=>{});
  it('reject invalid', async()=>{ const r=await execute({action:'invalid'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_ACTION'); });
  it('reject missing', async()=>{ const r=await execute({},{}); assert.equal(r.metadata.success,false); });
  it('reject null', async()=>{ const r=await execute(null,{}); assert.equal(r.metadata.success,false); });
  it('reject undefined', async()=>{ const r=await execute(undefined,{}); assert.equal(r.metadata.success,false); });
  it('list actions in error', async()=>{ const r=await execute({action:'bad'},{}); for(const a of VALID_ACTIONS) assert.ok(r.result.includes(a)); });
});

describe('plex-api: PROVIDER_NOT_CONFIGURED', ()=>{ beforeEach(()=>{});
  it('fail get_libraries no client', async()=>{ const r=await execute({action:'get_libraries'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail search_media no client', async()=>{ const r=await execute({action:'search_media',query:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail get_recently_added no client', async()=>{ const r=await execute({action:'get_recently_added'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail get_sessions no client', async()=>{ const r=await execute({action:'get_sessions'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
});

describe('plex-api: get_libraries', ()=>{ beforeEach(()=>{});
  it('get_libraries success', async()=>{ const r=await execute({action:'get_libraries'},mockContext(sample_get_libraries)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_libraries'); });
});

describe('plex-api: search_media', ()=>{ beforeEach(()=>{});
  it('search_media success', async()=>{ const r=await execute({action:'search_media',query:'test'},mockContext(sample_search_media)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'search_media'); });
  it('search_media missing param', async()=>{ const r=await execute({action:'search_media'},mockContext(sample_search_media)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('search_media non-string param', async()=>{ const r=await execute({action:'search_media',query:123},mockContext(sample_search_media)); assert.equal(r.metadata.success,false); });
});

describe('plex-api: get_recently_added', ()=>{ beforeEach(()=>{});
  it('get_recently_added success', async()=>{ const r=await execute({action:'get_recently_added'},mockContext(sample_get_recently_added)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_recently_added'); });
});

describe('plex-api: get_sessions', ()=>{ beforeEach(()=>{});
  it('get_sessions success', async()=>{ const r=await execute({action:'get_sessions'},mockContext(sample_get_sessions)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_sessions'); });
});

describe('plex-api: timeout', ()=>{ beforeEach(()=>{});
  it('timeout get_libraries', async()=>{ const r=await execute({action:'get_libraries'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout search_media', async()=>{ const r=await execute({action:'search_media',query:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout get_recently_added', async()=>{ const r=await execute({action:'get_recently_added'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout get_sessions', async()=>{ const r=await execute({action:'get_sessions'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
});

describe('plex-api: network errors', ()=>{ beforeEach(()=>{});
  it('UPSTREAM_ERROR', async()=>{ const r=await execute({action:'get_libraries'},mockContextError(new Error('fail'))); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'UPSTREAM_ERROR'); });
  it('include msg', async()=>{ const r=await execute({action:'get_libraries'},mockContextError(new Error('fail'))); assert.ok(r.result.includes('fail')); });
});

describe('plex-api: getClient', ()=>{ beforeEach(()=>{});
  it('prefer provider', ()=>{ assert.equal(getClient({providerClient:{request:()=>{}},gatewayClient:{request:()=>{}}}).type,'provider'); });
  it('fallback gateway', ()=>{ assert.equal(getClient({gatewayClient:{request:()=>{}}}).type,'gateway'); });
  it('null empty', ()=>{ assert.equal(getClient({}),null); });
  it('null undef', ()=>{ assert.equal(getClient(undefined),null); });
  it('null null', ()=>{ assert.equal(getClient(null),null); });
});

describe('plex-api: redactSensitive', ()=>{ beforeEach(()=>{});
  it('redact api_key', ()=>{ assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('redact bearer', ()=>{ assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('clean unchanged', ()=>{ assert.equal(redactSensitive('clean'),'clean'); });
  it('non-string', ()=>{ assert.equal(redactSensitive(42),42); });
});

describe('plex-api: resolveTimeout', ()=>{ beforeEach(()=>{});
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

describe('plex-api: validate()', ()=>{ beforeEach(()=>{});
  it('reject invalid', ()=>{ assert.equal(validate({action:'bad'}).valid,false); });
  it('reject null', ()=>{ assert.equal(validate(null).valid,false); });
  it('get_libraries valid no params', ()=>{ assert.equal(validate({action:'get_libraries'}).valid,true); });
  it('search_media req params', ()=>{ assert.equal(validate({action:'search_media'}).valid,false); assert.equal(validate({action:'search_media',query:'t'}).valid,true); });
  it('get_recently_added valid no params', ()=>{ assert.equal(validate({action:'get_recently_added'}).valid,true); });
  it('get_sessions valid no params', ()=>{ assert.equal(validate({action:'get_sessions'}).valid,true); });
});

describe('plex-api: meta', ()=>{ beforeEach(()=>{});
  it('name', ()=>{ assert.equal(meta.name,'plex-api'); });
  it('version', ()=>{ assert.equal(meta.version,'1.0.0'); });
  it('actions count', ()=>{ assert.equal(meta.actions.length,4); });
});

describe('plex-api: gateway fallback', ()=>{ beforeEach(()=>{});
  it('use gateway', async()=>{ const ctx={gatewayClient:{request:async()=>sample_get_libraries},config:{timeoutMs:5000}}; const r=await execute({action:'get_libraries'},ctx); assert.equal(r.metadata.success,true); });
});

describe('plex-api: providerNotConfiguredError', ()=>{ beforeEach(()=>{});
  it('success false', ()=>{ assert.equal(providerNotConfiguredError().metadata.success,false); });
  it('code', ()=>{ assert.equal(providerNotConfiguredError().metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('retriable false', ()=>{ assert.equal(providerNotConfiguredError().metadata.error.retriable,false); });
});

describe('plex-api: constants', ()=>{ beforeEach(()=>{});
  it('VALID_ACTIONS', ()=>{ assert.deepEqual(VALID_ACTIONS,['get_libraries','search_media','get_recently_added','get_sessions']); });
});

describe('plex-api: request paths', ()=>{ beforeEach(()=>{});
  it('path get_libraries', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_libraries;}},config:{timeoutMs:5000}}; await execute({action:'get_libraries'},ctx); assert.ok(p!==null); });
  it('path search_media', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_search_media;}},config:{timeoutMs:5000}}; await execute({action:'search_media',query:'test'},ctx); assert.ok(p!==null); });
  it('path get_recently_added', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_recently_added;}},config:{timeoutMs:5000}}; await execute({action:'get_recently_added'},ctx); assert.ok(p!==null); });
  it('path get_sessions', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_sessions;}},config:{timeoutMs:5000}}; await execute({action:'get_sessions'},ctx); assert.ok(p!==null); });
});
