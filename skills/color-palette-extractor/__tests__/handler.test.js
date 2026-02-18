import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute, validate, meta, getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS } from '../handler.js';

function mockContext(r,c){ return {providerClient:{request:async()=>r},config:c||{timeoutMs:5000}}; }
function mockContextError(e){ return {providerClient:{request:async()=>{throw e;}},config:{timeoutMs:1000}}; }
function mockContextTimeout(){ return {providerClient:{request:async()=>{const e=new Error('aborted');e.name='AbortError';throw e;}},config:{timeoutMs:100}}; }

const sample_extract_palette = {"colors":["#FF5733","#33FF57","#3357FF"],"palette_name":"Vibrant"};
const sample_get_complementary = {"input":"#FF5733","complementary":"#33CCFF","triadic":["#57FF33","#3357FF"]};
const sample_analyze_image = {"dominant":"#FF5733","brightness":0.65,"contrast":0.8,"warmth":"warm"};
const sample_generate_palette = {"colors":["#FF5733","#FF8D33","#FFC133"],"scheme":"analogous"};

describe('color-palette-extractor: action validation', ()=>{ beforeEach(()=>{});
  it('reject invalid', async()=>{ const r=await execute({action:'invalid'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_ACTION'); });
  it('reject missing', async()=>{ const r=await execute({},{}); assert.equal(r.metadata.success,false); });
  it('reject null', async()=>{ const r=await execute(null,{}); assert.equal(r.metadata.success,false); });
  it('reject undefined', async()=>{ const r=await execute(undefined,{}); assert.equal(r.metadata.success,false); });
  it('list actions in error', async()=>{ const r=await execute({action:'bad'},{}); for(const a of VALID_ACTIONS) assert.ok(r.result.includes(a)); });
});

describe('color-palette-extractor: PROVIDER_NOT_CONFIGURED', ()=>{ beforeEach(()=>{});
  it('fail extract_palette no client', async()=>{ const r=await execute({action:'extract_palette',imageUrl:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail get_complementary no client', async()=>{ const r=await execute({action:'get_complementary',color:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail analyze_image no client', async()=>{ const r=await execute({action:'analyze_image',imageUrl:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail generate_palette no client', async()=>{ const r=await execute({action:'generate_palette',baseColor:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
});

describe('color-palette-extractor: extract_palette', ()=>{ beforeEach(()=>{});
  it('extract_palette success', async()=>{ const r=await execute({action:'extract_palette',imageUrl:'test'},mockContext(sample_extract_palette)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'extract_palette'); });
  it('extract_palette missing param', async()=>{ const r=await execute({action:'extract_palette'},mockContext(sample_extract_palette)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('extract_palette non-string param', async()=>{ const r=await execute({action:'extract_palette',imageUrl:123},mockContext(sample_extract_palette)); assert.equal(r.metadata.success,false); });
});

describe('color-palette-extractor: get_complementary', ()=>{ beforeEach(()=>{});
  it('get_complementary success', async()=>{ const r=await execute({action:'get_complementary',color:'test'},mockContext(sample_get_complementary)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_complementary'); });
  it('get_complementary missing param', async()=>{ const r=await execute({action:'get_complementary'},mockContext(sample_get_complementary)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('get_complementary non-string param', async()=>{ const r=await execute({action:'get_complementary',color:123},mockContext(sample_get_complementary)); assert.equal(r.metadata.success,false); });
});

describe('color-palette-extractor: analyze_image', ()=>{ beforeEach(()=>{});
  it('analyze_image success', async()=>{ const r=await execute({action:'analyze_image',imageUrl:'test'},mockContext(sample_analyze_image)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'analyze_image'); });
  it('analyze_image missing param', async()=>{ const r=await execute({action:'analyze_image'},mockContext(sample_analyze_image)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('analyze_image non-string param', async()=>{ const r=await execute({action:'analyze_image',imageUrl:123},mockContext(sample_analyze_image)); assert.equal(r.metadata.success,false); });
});

describe('color-palette-extractor: generate_palette', ()=>{ beforeEach(()=>{});
  it('generate_palette success', async()=>{ const r=await execute({action:'generate_palette',baseColor:'test'},mockContext(sample_generate_palette)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'generate_palette'); });
  it('generate_palette missing param', async()=>{ const r=await execute({action:'generate_palette'},mockContext(sample_generate_palette)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('generate_palette non-string param', async()=>{ const r=await execute({action:'generate_palette',baseColor:123},mockContext(sample_generate_palette)); assert.equal(r.metadata.success,false); });
});

describe('color-palette-extractor: timeout', ()=>{ beforeEach(()=>{});
  it('timeout extract_palette', async()=>{ const r=await execute({action:'extract_palette',imageUrl:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout get_complementary', async()=>{ const r=await execute({action:'get_complementary',color:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout analyze_image', async()=>{ const r=await execute({action:'analyze_image',imageUrl:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout generate_palette', async()=>{ const r=await execute({action:'generate_palette',baseColor:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
});

describe('color-palette-extractor: network errors', ()=>{ beforeEach(()=>{});
  it('UPSTREAM_ERROR', async()=>{ const r=await execute({action:'extract_palette',imageUrl:'test'},mockContextError(new Error('fail'))); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'UPSTREAM_ERROR'); });
  it('include msg', async()=>{ const r=await execute({action:'extract_palette',imageUrl:'test'},mockContextError(new Error('fail'))); assert.ok(r.result.includes('fail')); });
});

describe('color-palette-extractor: getClient', ()=>{ beforeEach(()=>{});
  it('prefer provider', ()=>{ assert.equal(getClient({providerClient:{request:()=>{}},gatewayClient:{request:()=>{}}}).type,'provider'); });
  it('fallback gateway', ()=>{ assert.equal(getClient({gatewayClient:{request:()=>{}}}).type,'gateway'); });
  it('null empty', ()=>{ assert.equal(getClient({}),null); });
  it('null undef', ()=>{ assert.equal(getClient(undefined),null); });
  it('null null', ()=>{ assert.equal(getClient(null),null); });
});

describe('color-palette-extractor: redactSensitive', ()=>{ beforeEach(()=>{});
  it('redact api_key', ()=>{ assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('redact bearer', ()=>{ assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('clean unchanged', ()=>{ assert.equal(redactSensitive('clean'),'clean'); });
  it('non-string', ()=>{ assert.equal(redactSensitive(42),42); });
});

describe('color-palette-extractor: resolveTimeout', ()=>{ beforeEach(()=>{});
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

describe('color-palette-extractor: validate()', ()=>{ beforeEach(()=>{});
  it('reject invalid', ()=>{ assert.equal(validate({action:'bad'}).valid,false); });
  it('reject null', ()=>{ assert.equal(validate(null).valid,false); });
  it('extract_palette req params', ()=>{ assert.equal(validate({action:'extract_palette'}).valid,false); assert.equal(validate({action:'extract_palette',imageUrl:'t'}).valid,true); });
  it('get_complementary req params', ()=>{ assert.equal(validate({action:'get_complementary'}).valid,false); assert.equal(validate({action:'get_complementary',color:'t'}).valid,true); });
  it('analyze_image req params', ()=>{ assert.equal(validate({action:'analyze_image'}).valid,false); assert.equal(validate({action:'analyze_image',imageUrl:'t'}).valid,true); });
  it('generate_palette req params', ()=>{ assert.equal(validate({action:'generate_palette'}).valid,false); assert.equal(validate({action:'generate_palette',baseColor:'t'}).valid,true); });
});

describe('color-palette-extractor: meta', ()=>{ beforeEach(()=>{});
  it('name', ()=>{ assert.equal(meta.name,'color-palette-extractor'); });
  it('version', ()=>{ assert.equal(meta.version,'1.0.0'); });
  it('actions count', ()=>{ assert.equal(meta.actions.length,4); });
});

describe('color-palette-extractor: gateway fallback', ()=>{ beforeEach(()=>{});
  it('use gateway', async()=>{ const ctx={gatewayClient:{request:async()=>sample_extract_palette},config:{timeoutMs:5000}}; const r=await execute({action:'extract_palette',imageUrl:'test'},ctx); assert.equal(r.metadata.success,true); });
});

describe('color-palette-extractor: providerNotConfiguredError', ()=>{ beforeEach(()=>{});
  it('success false', ()=>{ assert.equal(providerNotConfiguredError().metadata.success,false); });
  it('code', ()=>{ assert.equal(providerNotConfiguredError().metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('retriable false', ()=>{ assert.equal(providerNotConfiguredError().metadata.error.retriable,false); });
});

describe('color-palette-extractor: constants', ()=>{ beforeEach(()=>{});
  it('VALID_ACTIONS', ()=>{ assert.deepEqual(VALID_ACTIONS,['extract_palette','get_complementary','analyze_image','generate_palette']); });
});

describe('color-palette-extractor: request paths', ()=>{ beforeEach(()=>{});
  it('path extract_palette', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_extract_palette;}},config:{timeoutMs:5000}}; await execute({action:'extract_palette',imageUrl:'test'},ctx); assert.ok(p!==null); });
  it('path get_complementary', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_complementary;}},config:{timeoutMs:5000}}; await execute({action:'get_complementary',color:'test'},ctx); assert.ok(p!==null); });
  it('path analyze_image', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_analyze_image;}},config:{timeoutMs:5000}}; await execute({action:'analyze_image',imageUrl:'test'},ctx); assert.ok(p!==null); });
  it('path generate_palette', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_generate_palette;}},config:{timeoutMs:5000}}; await execute({action:'generate_palette',baseColor:'test'},ctx); assert.ok(p!==null); });
});
