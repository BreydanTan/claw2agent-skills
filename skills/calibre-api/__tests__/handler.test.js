import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute, validate, meta, getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS } from '../handler.js';

function mockContext(r,c){ return {providerClient:{request:async()=>r},config:c||{timeoutMs:5000}}; }
function mockContextError(e){ return {providerClient:{request:async()=>{throw e;}},config:{timeoutMs:1000}}; }
function mockContextTimeout(){ return {providerClient:{request:async()=>{const e=new Error('aborted');e.name='AbortError';throw e;}},config:{timeoutMs:100}}; }

const sample_list_books = {"total_num":100,"book_ids":[1,2,3]};
const sample_get_book = {"title":"Dune","authors":["Frank Herbert"],"formats":["epub","pdf"]};
const sample_get_categories = {"category_map":{"tags":{},"authors":{}}};
const sample_search_books = {"total_num":5,"book_ids":[1,2]};

describe('calibre-api: action validation', ()=>{ beforeEach(()=>{});
  it('reject invalid', async()=>{ const r=await execute({action:'invalid'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_ACTION'); });
  it('reject missing', async()=>{ const r=await execute({},{}); assert.equal(r.metadata.success,false); });
  it('reject null', async()=>{ const r=await execute(null,{}); assert.equal(r.metadata.success,false); });
  it('reject undefined', async()=>{ const r=await execute(undefined,{}); assert.equal(r.metadata.success,false); });
  it('list actions in error', async()=>{ const r=await execute({action:'bad'},{}); for(const a of VALID_ACTIONS) assert.ok(r.result.includes(a)); });
});

describe('calibre-api: PROVIDER_NOT_CONFIGURED', ()=>{ beforeEach(()=>{});
  it('fail list_books no client', async()=>{ const r=await execute({action:'list_books'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail get_book no client', async()=>{ const r=await execute({action:'get_book',bookId:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail get_categories no client', async()=>{ const r=await execute({action:'get_categories'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail search_books no client', async()=>{ const r=await execute({action:'search_books',query:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
});

describe('calibre-api: list_books', ()=>{ beforeEach(()=>{});
  it('list_books success', async()=>{ const r=await execute({action:'list_books'},mockContext(sample_list_books)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'list_books'); });
});

describe('calibre-api: get_book', ()=>{ beforeEach(()=>{});
  it('get_book success', async()=>{ const r=await execute({action:'get_book',bookId:'test'},mockContext(sample_get_book)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_book'); });
  it('get_book missing param', async()=>{ const r=await execute({action:'get_book'},mockContext(sample_get_book)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('get_book non-string param', async()=>{ const r=await execute({action:'get_book',bookId:123},mockContext(sample_get_book)); assert.equal(r.metadata.success,false); });
});

describe('calibre-api: get_categories', ()=>{ beforeEach(()=>{});
  it('get_categories success', async()=>{ const r=await execute({action:'get_categories'},mockContext(sample_get_categories)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_categories'); });
});

describe('calibre-api: search_books', ()=>{ beforeEach(()=>{});
  it('search_books success', async()=>{ const r=await execute({action:'search_books',query:'test'},mockContext(sample_search_books)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'search_books'); });
  it('search_books missing param', async()=>{ const r=await execute({action:'search_books'},mockContext(sample_search_books)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('search_books non-string param', async()=>{ const r=await execute({action:'search_books',query:123},mockContext(sample_search_books)); assert.equal(r.metadata.success,false); });
});

describe('calibre-api: timeout', ()=>{ beforeEach(()=>{});
  it('timeout list_books', async()=>{ const r=await execute({action:'list_books'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout get_book', async()=>{ const r=await execute({action:'get_book',bookId:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout get_categories', async()=>{ const r=await execute({action:'get_categories'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout search_books', async()=>{ const r=await execute({action:'search_books',query:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
});

describe('calibre-api: network errors', ()=>{ beforeEach(()=>{});
  it('UPSTREAM_ERROR', async()=>{ const r=await execute({action:'list_books'},mockContextError(new Error('fail'))); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'UPSTREAM_ERROR'); });
  it('include msg', async()=>{ const r=await execute({action:'list_books'},mockContextError(new Error('fail'))); assert.ok(r.result.includes('fail')); });
});

describe('calibre-api: getClient', ()=>{ beforeEach(()=>{});
  it('prefer provider', ()=>{ assert.equal(getClient({providerClient:{request:()=>{}},gatewayClient:{request:()=>{}}}).type,'provider'); });
  it('fallback gateway', ()=>{ assert.equal(getClient({gatewayClient:{request:()=>{}}}).type,'gateway'); });
  it('null empty', ()=>{ assert.equal(getClient({}),null); });
  it('null undef', ()=>{ assert.equal(getClient(undefined),null); });
  it('null null', ()=>{ assert.equal(getClient(null),null); });
});

describe('calibre-api: redactSensitive', ()=>{ beforeEach(()=>{});
  it('redact api_key', ()=>{ assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('redact bearer', ()=>{ assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('clean unchanged', ()=>{ assert.equal(redactSensitive('clean'),'clean'); });
  it('non-string', ()=>{ assert.equal(redactSensitive(42),42); });
});

describe('calibre-api: resolveTimeout', ()=>{ beforeEach(()=>{});
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

describe('calibre-api: validate()', ()=>{ beforeEach(()=>{});
  it('reject invalid', ()=>{ assert.equal(validate({action:'bad'}).valid,false); });
  it('reject null', ()=>{ assert.equal(validate(null).valid,false); });
  it('list_books valid no params', ()=>{ assert.equal(validate({action:'list_books'}).valid,true); });
  it('get_book req params', ()=>{ assert.equal(validate({action:'get_book'}).valid,false); assert.equal(validate({action:'get_book',bookId:'t'}).valid,true); });
  it('get_categories valid no params', ()=>{ assert.equal(validate({action:'get_categories'}).valid,true); });
  it('search_books req params', ()=>{ assert.equal(validate({action:'search_books'}).valid,false); assert.equal(validate({action:'search_books',query:'t'}).valid,true); });
});

describe('calibre-api: meta', ()=>{ beforeEach(()=>{});
  it('name', ()=>{ assert.equal(meta.name,'calibre-api'); });
  it('version', ()=>{ assert.equal(meta.version,'1.0.0'); });
  it('actions count', ()=>{ assert.equal(meta.actions.length,4); });
});

describe('calibre-api: gateway fallback', ()=>{ beforeEach(()=>{});
  it('use gateway', async()=>{ const ctx={gatewayClient:{request:async()=>sample_list_books},config:{timeoutMs:5000}}; const r=await execute({action:'list_books'},ctx); assert.equal(r.metadata.success,true); });
});

describe('calibre-api: providerNotConfiguredError', ()=>{ beforeEach(()=>{});
  it('success false', ()=>{ assert.equal(providerNotConfiguredError().metadata.success,false); });
  it('code', ()=>{ assert.equal(providerNotConfiguredError().metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('retriable false', ()=>{ assert.equal(providerNotConfiguredError().metadata.error.retriable,false); });
});

describe('calibre-api: constants', ()=>{ beforeEach(()=>{});
  it('VALID_ACTIONS', ()=>{ assert.deepEqual(VALID_ACTIONS,['list_books','get_book','get_categories','search_books']); });
});

describe('calibre-api: request paths', ()=>{ beforeEach(()=>{});
  it('path list_books', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_list_books;}},config:{timeoutMs:5000}}; await execute({action:'list_books'},ctx); assert.ok(p!==null); });
  it('path get_book', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_book;}},config:{timeoutMs:5000}}; await execute({action:'get_book',bookId:'test'},ctx); assert.ok(p!==null); });
  it('path get_categories', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_categories;}},config:{timeoutMs:5000}}; await execute({action:'get_categories'},ctx); assert.ok(p!==null); });
  it('path search_books', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_search_books;}},config:{timeoutMs:5000}}; await execute({action:'search_books',query:'test'},ctx); assert.ok(p!==null); });
});
