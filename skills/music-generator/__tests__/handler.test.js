import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute, validate, meta, getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS } from '../handler.js';

function mockContext(r,c){ return {providerClient:{request:async()=>r},config:c||{timeoutMs:5000}}; }
function mockContextError(e){ return {providerClient:{request:async()=>{throw e;}},config:{timeoutMs:1000}}; }
function mockContextTimeout(){ return {providerClient:{request:async()=>{const e=new Error('aborted');e.name='AbortError';throw e;}},config:{timeoutMs:100}}; }

const sample_generate_track = {"trackId":"trk1","url":"https://example.com/track.mp3","duration":30};
const sample_get_track = {"trackId":"trk1","status":"completed","url":"https://example.com/track.mp3"};
const sample_list_tracks = {"tracks":[{"trackId":"trk1","prompt":"chill lo-fi"}]};
const sample_get_genres = {"genres":["lo-fi","jazz","electronic","classical"]};

describe('music-generator: action validation', ()=>{ beforeEach(()=>{});
  it('reject invalid', async()=>{ const r=await execute({action:'invalid'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_ACTION'); });
  it('reject missing', async()=>{ const r=await execute({},{}); assert.equal(r.metadata.success,false); });
  it('reject null', async()=>{ const r=await execute(null,{}); assert.equal(r.metadata.success,false); });
  it('reject undefined', async()=>{ const r=await execute(undefined,{}); assert.equal(r.metadata.success,false); });
  it('list actions in error', async()=>{ const r=await execute({action:'bad'},{}); for(const a of VALID_ACTIONS) assert.ok(r.result.includes(a)); });
});

describe('music-generator: PROVIDER_NOT_CONFIGURED', ()=>{ beforeEach(()=>{});
  it('fail generate_track no client', async()=>{ const r=await execute({action:'generate_track',prompt:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail get_track no client', async()=>{ const r=await execute({action:'get_track',trackId:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail list_tracks no client', async()=>{ const r=await execute({action:'list_tracks'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail get_genres no client', async()=>{ const r=await execute({action:'get_genres'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
});

describe('music-generator: generate_track', ()=>{ beforeEach(()=>{});
  it('generate_track success', async()=>{ const r=await execute({action:'generate_track',prompt:'test'},mockContext(sample_generate_track)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'generate_track'); });
  it('generate_track missing param', async()=>{ const r=await execute({action:'generate_track'},mockContext(sample_generate_track)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('generate_track non-string param', async()=>{ const r=await execute({action:'generate_track',prompt:123},mockContext(sample_generate_track)); assert.equal(r.metadata.success,false); });
});

describe('music-generator: get_track', ()=>{ beforeEach(()=>{});
  it('get_track success', async()=>{ const r=await execute({action:'get_track',trackId:'test'},mockContext(sample_get_track)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_track'); });
  it('get_track missing param', async()=>{ const r=await execute({action:'get_track'},mockContext(sample_get_track)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('get_track non-string param', async()=>{ const r=await execute({action:'get_track',trackId:123},mockContext(sample_get_track)); assert.equal(r.metadata.success,false); });
});

describe('music-generator: list_tracks', ()=>{ beforeEach(()=>{});
  it('list_tracks success', async()=>{ const r=await execute({action:'list_tracks'},mockContext(sample_list_tracks)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'list_tracks'); });
});

describe('music-generator: get_genres', ()=>{ beforeEach(()=>{});
  it('get_genres success', async()=>{ const r=await execute({action:'get_genres'},mockContext(sample_get_genres)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_genres'); });
});

describe('music-generator: timeout', ()=>{ beforeEach(()=>{});
  it('timeout generate_track', async()=>{ const r=await execute({action:'generate_track',prompt:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout get_track', async()=>{ const r=await execute({action:'get_track',trackId:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout list_tracks', async()=>{ const r=await execute({action:'list_tracks'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout get_genres', async()=>{ const r=await execute({action:'get_genres'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
});

describe('music-generator: network errors', ()=>{ beforeEach(()=>{});
  it('UPSTREAM_ERROR', async()=>{ const r=await execute({action:'generate_track',prompt:'test'},mockContextError(new Error('fail'))); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'UPSTREAM_ERROR'); });
  it('include msg', async()=>{ const r=await execute({action:'generate_track',prompt:'test'},mockContextError(new Error('fail'))); assert.ok(r.result.includes('fail')); });
});

describe('music-generator: getClient', ()=>{ beforeEach(()=>{});
  it('prefer provider', ()=>{ assert.equal(getClient({providerClient:{request:()=>{}},gatewayClient:{request:()=>{}}}).type,'provider'); });
  it('fallback gateway', ()=>{ assert.equal(getClient({gatewayClient:{request:()=>{}}}).type,'gateway'); });
  it('null empty', ()=>{ assert.equal(getClient({}),null); });
  it('null undef', ()=>{ assert.equal(getClient(undefined),null); });
  it('null null', ()=>{ assert.equal(getClient(null),null); });
});

describe('music-generator: redactSensitive', ()=>{ beforeEach(()=>{});
  it('redact api_key', ()=>{ assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('redact bearer', ()=>{ assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('clean unchanged', ()=>{ assert.equal(redactSensitive('clean'),'clean'); });
  it('non-string', ()=>{ assert.equal(redactSensitive(42),42); });
});

describe('music-generator: resolveTimeout', ()=>{ beforeEach(()=>{});
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

describe('music-generator: validate()', ()=>{ beforeEach(()=>{});
  it('reject invalid', ()=>{ assert.equal(validate({action:'bad'}).valid,false); });
  it('reject null', ()=>{ assert.equal(validate(null).valid,false); });
  it('generate_track req params', ()=>{ assert.equal(validate({action:'generate_track'}).valid,false); assert.equal(validate({action:'generate_track',prompt:'t'}).valid,true); });
  it('get_track req params', ()=>{ assert.equal(validate({action:'get_track'}).valid,false); assert.equal(validate({action:'get_track',trackId:'t'}).valid,true); });
  it('list_tracks valid no params', ()=>{ assert.equal(validate({action:'list_tracks'}).valid,true); });
  it('get_genres valid no params', ()=>{ assert.equal(validate({action:'get_genres'}).valid,true); });
});

describe('music-generator: meta', ()=>{ beforeEach(()=>{});
  it('name', ()=>{ assert.equal(meta.name,'music-generator'); });
  it('version', ()=>{ assert.equal(meta.version,'1.0.0'); });
  it('actions count', ()=>{ assert.equal(meta.actions.length,4); });
});

describe('music-generator: gateway fallback', ()=>{ beforeEach(()=>{});
  it('use gateway', async()=>{ const ctx={gatewayClient:{request:async()=>sample_generate_track},config:{timeoutMs:5000}}; const r=await execute({action:'generate_track',prompt:'test'},ctx); assert.equal(r.metadata.success,true); });
});

describe('music-generator: providerNotConfiguredError', ()=>{ beforeEach(()=>{});
  it('success false', ()=>{ assert.equal(providerNotConfiguredError().metadata.success,false); });
  it('code', ()=>{ assert.equal(providerNotConfiguredError().metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('retriable false', ()=>{ assert.equal(providerNotConfiguredError().metadata.error.retriable,false); });
});

describe('music-generator: constants', ()=>{ beforeEach(()=>{});
  it('VALID_ACTIONS', ()=>{ assert.deepEqual(VALID_ACTIONS,['generate_track','get_track','list_tracks','get_genres']); });
});

describe('music-generator: request paths', ()=>{ beforeEach(()=>{});
  it('path generate_track', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_generate_track;}},config:{timeoutMs:5000}}; await execute({action:'generate_track',prompt:'test'},ctx); assert.ok(p!==null); });
  it('path get_track', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_track;}},config:{timeoutMs:5000}}; await execute({action:'get_track',trackId:'test'},ctx); assert.ok(p!==null); });
  it('path list_tracks', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_list_tracks;}},config:{timeoutMs:5000}}; await execute({action:'list_tracks'},ctx); assert.ok(p!==null); });
  it('path get_genres', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_genres;}},config:{timeoutMs:5000}}; await execute({action:'get_genres'},ctx); assert.ok(p!==null); });
});
