import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute, validate, meta, getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS } from '../handler.js';

function mockContext(r,c){ return {providerClient:{request:async()=>r},config:c||{timeoutMs:5000}}; }
function mockContextError(e){ return {providerClient:{request:async()=>{throw e;}},config:{timeoutMs:1000}}; }
function mockContextTimeout(){ return {providerClient:{request:async()=>{const e=new Error('aborted');e.name='AbortError';throw e;}},config:{timeoutMs:100}}; }

const sample_get_events = [{"id":"ev1","camera":"front_door","label":"person","start_time":1700000000}];
const sample_get_config = {"cameras":{"front_door":{"enabled":true}},"detectors":{"coral":{"type":"edgetpu"}}};
const sample_get_stats = {"cameras":{"front_door":{"fps":15,"detection_fps":5}},"cpu_usages":{}};
const sample_get_recordings = [{"day":"2024-01-01","hours":[{"hour":0,"duration":3600}]}];

describe('frigate-nvr-api: action validation', ()=>{ beforeEach(()=>{});
  it('reject invalid', async()=>{ const r=await execute({action:'invalid'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_ACTION'); });
  it('reject missing', async()=>{ const r=await execute({},{}); assert.equal(r.metadata.success,false); });
  it('reject null', async()=>{ const r=await execute(null,{}); assert.equal(r.metadata.success,false); });
  it('reject undefined', async()=>{ const r=await execute(undefined,{}); assert.equal(r.metadata.success,false); });
  it('list actions in error', async()=>{ const r=await execute({action:'bad'},{}); for(const a of VALID_ACTIONS) assert.ok(r.result.includes(a)); });
});

describe('frigate-nvr-api: PROVIDER_NOT_CONFIGURED', ()=>{ beforeEach(()=>{});
  it('fail get_events no client', async()=>{ const r=await execute({action:'get_events'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail get_config no client', async()=>{ const r=await execute({action:'get_config'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail get_stats no client', async()=>{ const r=await execute({action:'get_stats'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail get_recordings no client', async()=>{ const r=await execute({action:'get_recordings',camera:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
});

describe('frigate-nvr-api: get_events', ()=>{ beforeEach(()=>{});
  it('get_events success', async()=>{ const r=await execute({action:'get_events'},mockContext(sample_get_events)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_events'); });
});

describe('frigate-nvr-api: get_config', ()=>{ beforeEach(()=>{});
  it('get_config success', async()=>{ const r=await execute({action:'get_config'},mockContext(sample_get_config)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_config'); });
});

describe('frigate-nvr-api: get_stats', ()=>{ beforeEach(()=>{});
  it('get_stats success', async()=>{ const r=await execute({action:'get_stats'},mockContext(sample_get_stats)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_stats'); });
});

describe('frigate-nvr-api: get_recordings', ()=>{ beforeEach(()=>{});
  it('get_recordings success', async()=>{ const r=await execute({action:'get_recordings',camera:'test'},mockContext(sample_get_recordings)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_recordings'); });
  it('get_recordings missing param', async()=>{ const r=await execute({action:'get_recordings'},mockContext(sample_get_recordings)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('get_recordings non-string param', async()=>{ const r=await execute({action:'get_recordings',camera:123},mockContext(sample_get_recordings)); assert.equal(r.metadata.success,false); });
});

describe('frigate-nvr-api: timeout', ()=>{ beforeEach(()=>{});
  it('timeout get_events', async()=>{ const r=await execute({action:'get_events'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout get_config', async()=>{ const r=await execute({action:'get_config'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout get_stats', async()=>{ const r=await execute({action:'get_stats'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout get_recordings', async()=>{ const r=await execute({action:'get_recordings',camera:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
});

describe('frigate-nvr-api: network errors', ()=>{ beforeEach(()=>{});
  it('UPSTREAM_ERROR', async()=>{ const r=await execute({action:'get_events'},mockContextError(new Error('fail'))); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'UPSTREAM_ERROR'); });
  it('include msg', async()=>{ const r=await execute({action:'get_events'},mockContextError(new Error('fail'))); assert.ok(r.result.includes('fail')); });
});

describe('frigate-nvr-api: getClient', ()=>{ beforeEach(()=>{});
  it('prefer provider', ()=>{ assert.equal(getClient({providerClient:{request:()=>{}},gatewayClient:{request:()=>{}}}).type,'provider'); });
  it('fallback gateway', ()=>{ assert.equal(getClient({gatewayClient:{request:()=>{}}}).type,'gateway'); });
  it('null empty', ()=>{ assert.equal(getClient({}),null); });
  it('null undef', ()=>{ assert.equal(getClient(undefined),null); });
  it('null null', ()=>{ assert.equal(getClient(null),null); });
});

describe('frigate-nvr-api: redactSensitive', ()=>{ beforeEach(()=>{});
  it('redact api_key', ()=>{ assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('redact bearer', ()=>{ assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('clean unchanged', ()=>{ assert.equal(redactSensitive('clean'),'clean'); });
  it('non-string', ()=>{ assert.equal(redactSensitive(42),42); });
});

describe('frigate-nvr-api: resolveTimeout', ()=>{ beforeEach(()=>{});
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

describe('frigate-nvr-api: validate()', ()=>{ beforeEach(()=>{});
  it('reject invalid', ()=>{ assert.equal(validate({action:'bad'}).valid,false); });
  it('reject null', ()=>{ assert.equal(validate(null).valid,false); });
  it('get_events valid no params', ()=>{ assert.equal(validate({action:'get_events'}).valid,true); });
  it('get_config valid no params', ()=>{ assert.equal(validate({action:'get_config'}).valid,true); });
  it('get_stats valid no params', ()=>{ assert.equal(validate({action:'get_stats'}).valid,true); });
  it('get_recordings req params', ()=>{ assert.equal(validate({action:'get_recordings'}).valid,false); assert.equal(validate({action:'get_recordings',camera:'t'}).valid,true); });
});

describe('frigate-nvr-api: meta', ()=>{ beforeEach(()=>{});
  it('name', ()=>{ assert.equal(meta.name,'frigate-nvr-api'); });
  it('version', ()=>{ assert.equal(meta.version,'1.0.0'); });
  it('actions count', ()=>{ assert.equal(meta.actions.length,4); });
});

describe('frigate-nvr-api: gateway fallback', ()=>{ beforeEach(()=>{});
  it('use gateway', async()=>{ const ctx={gatewayClient:{request:async()=>sample_get_events},config:{timeoutMs:5000}}; const r=await execute({action:'get_events'},ctx); assert.equal(r.metadata.success,true); });
});

describe('frigate-nvr-api: providerNotConfiguredError', ()=>{ beforeEach(()=>{});
  it('success false', ()=>{ assert.equal(providerNotConfiguredError().metadata.success,false); });
  it('code', ()=>{ assert.equal(providerNotConfiguredError().metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('retriable false', ()=>{ assert.equal(providerNotConfiguredError().metadata.error.retriable,false); });
});

describe('frigate-nvr-api: constants', ()=>{ beforeEach(()=>{});
  it('VALID_ACTIONS', ()=>{ assert.deepEqual(VALID_ACTIONS,['get_events','get_config','get_stats','get_recordings']); });
});

describe('frigate-nvr-api: request paths', ()=>{ beforeEach(()=>{});
  it('path get_events', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_events;}},config:{timeoutMs:5000}}; await execute({action:'get_events'},ctx); assert.ok(p!==null); });
  it('path get_config', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_config;}},config:{timeoutMs:5000}}; await execute({action:'get_config'},ctx); assert.ok(p!==null); });
  it('path get_stats', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_stats;}},config:{timeoutMs:5000}}; await execute({action:'get_stats'},ctx); assert.ok(p!==null); });
  it('path get_recordings', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_recordings;}},config:{timeoutMs:5000}}; await execute({action:'get_recordings',camera:'test'},ctx); assert.ok(p!==null); });
});
