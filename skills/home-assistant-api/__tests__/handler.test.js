import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute, validate, meta, getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS } from '../handler.js';

function mockContext(r,c){ return {providerClient:{request:async()=>r},config:c||{timeoutMs:5000}}; }
function mockContextError(e){ return {providerClient:{request:async()=>{throw e;}},config:{timeoutMs:1000}}; }
function mockContextTimeout(){ return {providerClient:{request:async()=>{const e=new Error('aborted');e.name='AbortError';throw e;}},config:{timeoutMs:100}}; }

const sample_get_states = {"value":[{"entity_id":"light.living_room","state":"on"}]};
const sample_get_entity = {"entity_id":"light.living_room","state":"on","attributes":{"brightness":255}};
const sample_call_service = {};
const sample_get_history = [[{"state":"on","last_changed":"2024-01-01T00:00:00Z"}]];

describe('home-assistant-api: action validation', ()=>{ beforeEach(()=>{});
  it('reject invalid', async()=>{ const r=await execute({action:'invalid'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_ACTION'); });
  it('reject missing', async()=>{ const r=await execute({},{}); assert.equal(r.metadata.success,false); });
  it('reject null', async()=>{ const r=await execute(null,{}); assert.equal(r.metadata.success,false); });
  it('reject undefined', async()=>{ const r=await execute(undefined,{}); assert.equal(r.metadata.success,false); });
  it('list actions in error', async()=>{ const r=await execute({action:'bad'},{}); for(const a of VALID_ACTIONS) assert.ok(r.result.includes(a)); });
});

describe('home-assistant-api: PROVIDER_NOT_CONFIGURED', ()=>{ beforeEach(()=>{});
  it('fail get_states no client', async()=>{ const r=await execute({action:'get_states'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail get_entity no client', async()=>{ const r=await execute({action:'get_entity',entityId:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail call_service no client', async()=>{ const r=await execute({action:'call_service',domain:'test',service:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail get_history no client', async()=>{ const r=await execute({action:'get_history',entityId:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
});

describe('home-assistant-api: get_states', ()=>{ beforeEach(()=>{});
  it('get_states success', async()=>{ const r=await execute({action:'get_states'},mockContext(sample_get_states)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_states'); });
});

describe('home-assistant-api: get_entity', ()=>{ beforeEach(()=>{});
  it('get_entity success', async()=>{ const r=await execute({action:'get_entity',entityId:'test'},mockContext(sample_get_entity)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_entity'); });
  it('get_entity missing param', async()=>{ const r=await execute({action:'get_entity'},mockContext(sample_get_entity)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('get_entity non-string param', async()=>{ const r=await execute({action:'get_entity',entityId:123},mockContext(sample_get_entity)); assert.equal(r.metadata.success,false); });
});

describe('home-assistant-api: call_service', ()=>{ beforeEach(()=>{});
  it('call_service success', async()=>{ const r=await execute({action:'call_service',domain:'test',service:'test'},mockContext(sample_call_service)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'call_service'); });
  it('call_service missing param', async()=>{ const r=await execute({action:'call_service'},mockContext(sample_call_service)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('call_service non-string param', async()=>{ const r=await execute({action:'call_service',domain:123},mockContext(sample_call_service)); assert.equal(r.metadata.success,false); });
});

describe('home-assistant-api: get_history', ()=>{ beforeEach(()=>{});
  it('get_history success', async()=>{ const r=await execute({action:'get_history',entityId:'test'},mockContext(sample_get_history)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_history'); });
  it('get_history missing param', async()=>{ const r=await execute({action:'get_history'},mockContext(sample_get_history)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('get_history non-string param', async()=>{ const r=await execute({action:'get_history',entityId:123},mockContext(sample_get_history)); assert.equal(r.metadata.success,false); });
});

describe('home-assistant-api: timeout', ()=>{ beforeEach(()=>{});
  it('timeout get_states', async()=>{ const r=await execute({action:'get_states'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout get_entity', async()=>{ const r=await execute({action:'get_entity',entityId:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout call_service', async()=>{ const r=await execute({action:'call_service',domain:'test',service:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout get_history', async()=>{ const r=await execute({action:'get_history',entityId:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
});

describe('home-assistant-api: network errors', ()=>{ beforeEach(()=>{});
  it('UPSTREAM_ERROR', async()=>{ const r=await execute({action:'get_states'},mockContextError(new Error('fail'))); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'UPSTREAM_ERROR'); });
  it('include msg', async()=>{ const r=await execute({action:'get_states'},mockContextError(new Error('fail'))); assert.ok(r.result.includes('fail')); });
});

describe('home-assistant-api: getClient', ()=>{ beforeEach(()=>{});
  it('prefer provider', ()=>{ assert.equal(getClient({providerClient:{request:()=>{}},gatewayClient:{request:()=>{}}}).type,'provider'); });
  it('fallback gateway', ()=>{ assert.equal(getClient({gatewayClient:{request:()=>{}}}).type,'gateway'); });
  it('null empty', ()=>{ assert.equal(getClient({}),null); });
  it('null undef', ()=>{ assert.equal(getClient(undefined),null); });
  it('null null', ()=>{ assert.equal(getClient(null),null); });
});

describe('home-assistant-api: redactSensitive', ()=>{ beforeEach(()=>{});
  it('redact api_key', ()=>{ assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('redact bearer', ()=>{ assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('clean unchanged', ()=>{ assert.equal(redactSensitive('clean'),'clean'); });
  it('non-string', ()=>{ assert.equal(redactSensitive(42),42); });
});

describe('home-assistant-api: resolveTimeout', ()=>{ beforeEach(()=>{});
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

describe('home-assistant-api: validate()', ()=>{ beforeEach(()=>{});
  it('reject invalid', ()=>{ assert.equal(validate({action:'bad'}).valid,false); });
  it('reject null', ()=>{ assert.equal(validate(null).valid,false); });
  it('get_states valid no params', ()=>{ assert.equal(validate({action:'get_states'}).valid,true); });
  it('get_entity req params', ()=>{ assert.equal(validate({action:'get_entity'}).valid,false); assert.equal(validate({action:'get_entity',entityId:'t'}).valid,true); });
  it('call_service req params', ()=>{ assert.equal(validate({action:'call_service'}).valid,false); assert.equal(validate({action:'call_service',domain:'t',service:'t'}).valid,true); });
  it('get_history req params', ()=>{ assert.equal(validate({action:'get_history'}).valid,false); assert.equal(validate({action:'get_history',entityId:'t'}).valid,true); });
});

describe('home-assistant-api: meta', ()=>{ beforeEach(()=>{});
  it('name', ()=>{ assert.equal(meta.name,'home-assistant-api'); });
  it('version', ()=>{ assert.equal(meta.version,'1.0.0'); });
  it('actions count', ()=>{ assert.equal(meta.actions.length,4); });
});

describe('home-assistant-api: gateway fallback', ()=>{ beforeEach(()=>{});
  it('use gateway', async()=>{ const ctx={gatewayClient:{request:async()=>sample_get_states},config:{timeoutMs:5000}}; const r=await execute({action:'get_states'},ctx); assert.equal(r.metadata.success,true); });
});

describe('home-assistant-api: providerNotConfiguredError', ()=>{ beforeEach(()=>{});
  it('success false', ()=>{ assert.equal(providerNotConfiguredError().metadata.success,false); });
  it('code', ()=>{ assert.equal(providerNotConfiguredError().metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('retriable false', ()=>{ assert.equal(providerNotConfiguredError().metadata.error.retriable,false); });
});

describe('home-assistant-api: constants', ()=>{ beforeEach(()=>{});
  it('VALID_ACTIONS', ()=>{ assert.deepEqual(VALID_ACTIONS,['get_states','get_entity','call_service','get_history']); });
});

describe('home-assistant-api: request paths', ()=>{ beforeEach(()=>{});
  it('path get_states', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_states;}},config:{timeoutMs:5000}}; await execute({action:'get_states'},ctx); assert.ok(p!==null); });
  it('path get_entity', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_entity;}},config:{timeoutMs:5000}}; await execute({action:'get_entity',entityId:'test'},ctx); assert.ok(p!==null); });
  it('path call_service', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_call_service;}},config:{timeoutMs:5000}}; await execute({action:'call_service',domain:'test',service:'test'},ctx); assert.ok(p!==null); });
  it('path get_history', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_history;}},config:{timeoutMs:5000}}; await execute({action:'get_history',entityId:'test'},ctx); assert.ok(p!==null); });
});
