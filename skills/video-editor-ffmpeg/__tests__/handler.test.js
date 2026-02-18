import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { execute, validate, meta, getClient, providerNotConfiguredError, resolveTimeout, requestWithTimeout, redactSensitive, validateNonEmptyString, VALID_ACTIONS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS } from '../handler.js';

function mockContext(r,c){ return {providerClient:{request:async()=>r},config:c||{timeoutMs:5000}}; }
function mockContextError(e){ return {providerClient:{request:async()=>{throw e;}},config:{timeoutMs:1000}}; }
function mockContextTimeout(){ return {providerClient:{request:async()=>{const e=new Error('aborted');e.name='AbortError';throw e;}},config:{timeoutMs:100}}; }

const sample_get_info = {"format":{"duration":"120.5","size":"50000000"},"streams":[{"codec_type":"video","width":1920,"height":1080}]};
const sample_convert = {"status":"completed","outputPath":"/output/video.mp4"};
const sample_extract_audio = {"status":"completed","outputPath":"/output/audio.mp3"};
const sample_thumbnail = {"status":"completed","outputPath":"/output/thumb.jpg"};

describe('video-editor-ffmpeg: action validation', ()=>{ beforeEach(()=>{});
  it('reject invalid', async()=>{ const r=await execute({action:'invalid'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_ACTION'); });
  it('reject missing', async()=>{ const r=await execute({},{}); assert.equal(r.metadata.success,false); });
  it('reject null', async()=>{ const r=await execute(null,{}); assert.equal(r.metadata.success,false); });
  it('reject undefined', async()=>{ const r=await execute(undefined,{}); assert.equal(r.metadata.success,false); });
  it('list actions in error', async()=>{ const r=await execute({action:'bad'},{}); for(const a of VALID_ACTIONS) assert.ok(r.result.includes(a)); });
});

describe('video-editor-ffmpeg: PROVIDER_NOT_CONFIGURED', ()=>{ beforeEach(()=>{});
  it('fail get_info no client', async()=>{ const r=await execute({action:'get_info',filePath:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail convert no client', async()=>{ const r=await execute({action:'convert',input:'test',output:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail extract_audio no client', async()=>{ const r=await execute({action:'extract_audio',input:'test',output:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('fail thumbnail no client', async()=>{ const r=await execute({action:'thumbnail',input:'test'},{}); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
});

describe('video-editor-ffmpeg: get_info', ()=>{ beforeEach(()=>{});
  it('get_info success', async()=>{ const r=await execute({action:'get_info',filePath:'test'},mockContext(sample_get_info)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'get_info'); });
  it('get_info missing param', async()=>{ const r=await execute({action:'get_info'},mockContext(sample_get_info)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('get_info non-string param', async()=>{ const r=await execute({action:'get_info',filePath:123},mockContext(sample_get_info)); assert.equal(r.metadata.success,false); });
});

describe('video-editor-ffmpeg: convert', ()=>{ beforeEach(()=>{});
  it('convert success', async()=>{ const r=await execute({action:'convert',input:'test',output:'test'},mockContext(sample_convert)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'convert'); });
  it('convert missing param', async()=>{ const r=await execute({action:'convert'},mockContext(sample_convert)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('convert non-string param', async()=>{ const r=await execute({action:'convert',input:123},mockContext(sample_convert)); assert.equal(r.metadata.success,false); });
});

describe('video-editor-ffmpeg: extract_audio', ()=>{ beforeEach(()=>{});
  it('extract_audio success', async()=>{ const r=await execute({action:'extract_audio',input:'test',output:'test'},mockContext(sample_extract_audio)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'extract_audio'); });
  it('extract_audio missing param', async()=>{ const r=await execute({action:'extract_audio'},mockContext(sample_extract_audio)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('extract_audio non-string param', async()=>{ const r=await execute({action:'extract_audio',input:123},mockContext(sample_extract_audio)); assert.equal(r.metadata.success,false); });
});

describe('video-editor-ffmpeg: thumbnail', ()=>{ beforeEach(()=>{});
  it('thumbnail success', async()=>{ const r=await execute({action:'thumbnail',input:'test'},mockContext(sample_thumbnail)); assert.equal(r.metadata.success,true); assert.equal(r.metadata.action,'thumbnail'); });
  it('thumbnail missing param', async()=>{ const r=await execute({action:'thumbnail'},mockContext(sample_thumbnail)); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'INVALID_INPUT'); });
  it('thumbnail non-string param', async()=>{ const r=await execute({action:'thumbnail',input:123},mockContext(sample_thumbnail)); assert.equal(r.metadata.success,false); });
});

describe('video-editor-ffmpeg: timeout', ()=>{ beforeEach(()=>{});
  it('timeout get_info', async()=>{ const r=await execute({action:'get_info',filePath:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout convert', async()=>{ const r=await execute({action:'convert',input:'test',output:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout extract_audio', async()=>{ const r=await execute({action:'extract_audio',input:'test',output:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
  it('timeout thumbnail', async()=>{ const r=await execute({action:'thumbnail',input:'test'},mockContextTimeout()); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'TIMEOUT'); });
});

describe('video-editor-ffmpeg: network errors', ()=>{ beforeEach(()=>{});
  it('UPSTREAM_ERROR', async()=>{ const r=await execute({action:'get_info',filePath:'test'},mockContextError(new Error('fail'))); assert.equal(r.metadata.success,false); assert.equal(r.metadata.error,'UPSTREAM_ERROR'); });
  it('include msg', async()=>{ const r=await execute({action:'get_info',filePath:'test'},mockContextError(new Error('fail'))); assert.ok(r.result.includes('fail')); });
});

describe('video-editor-ffmpeg: getClient', ()=>{ beforeEach(()=>{});
  it('prefer provider', ()=>{ assert.equal(getClient({providerClient:{request:()=>{}},gatewayClient:{request:()=>{}}}).type,'provider'); });
  it('fallback gateway', ()=>{ assert.equal(getClient({gatewayClient:{request:()=>{}}}).type,'gateway'); });
  it('null empty', ()=>{ assert.equal(getClient({}),null); });
  it('null undef', ()=>{ assert.equal(getClient(undefined),null); });
  it('null null', ()=>{ assert.equal(getClient(null),null); });
});

describe('video-editor-ffmpeg: redactSensitive', ()=>{ beforeEach(()=>{});
  it('redact api_key', ()=>{ assert.ok(redactSensitive('api_key: sample_key_placeholder').includes('[REDACTED]')); });
  it('redact bearer', ()=>{ assert.ok(redactSensitive('bearer: test_placeholder_token').includes('[REDACTED]')); });
  it('clean unchanged', ()=>{ assert.equal(redactSensitive('clean'),'clean'); });
  it('non-string', ()=>{ assert.equal(redactSensitive(42),42); });
});

describe('video-editor-ffmpeg: resolveTimeout', ()=>{ beforeEach(()=>{});
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

describe('video-editor-ffmpeg: validate()', ()=>{ beforeEach(()=>{});
  it('reject invalid', ()=>{ assert.equal(validate({action:'bad'}).valid,false); });
  it('reject null', ()=>{ assert.equal(validate(null).valid,false); });
  it('get_info req params', ()=>{ assert.equal(validate({action:'get_info'}).valid,false); assert.equal(validate({action:'get_info',filePath:'t'}).valid,true); });
  it('convert req params', ()=>{ assert.equal(validate({action:'convert'}).valid,false); assert.equal(validate({action:'convert',input:'t',output:'t'}).valid,true); });
  it('extract_audio req params', ()=>{ assert.equal(validate({action:'extract_audio'}).valid,false); assert.equal(validate({action:'extract_audio',input:'t',output:'t'}).valid,true); });
  it('thumbnail req params', ()=>{ assert.equal(validate({action:'thumbnail'}).valid,false); assert.equal(validate({action:'thumbnail',input:'t'}).valid,true); });
});

describe('video-editor-ffmpeg: meta', ()=>{ beforeEach(()=>{});
  it('name', ()=>{ assert.equal(meta.name,'video-editor-ffmpeg'); });
  it('version', ()=>{ assert.equal(meta.version,'1.0.0'); });
  it('actions count', ()=>{ assert.equal(meta.actions.length,4); });
});

describe('video-editor-ffmpeg: gateway fallback', ()=>{ beforeEach(()=>{});
  it('use gateway', async()=>{ const ctx={gatewayClient:{request:async()=>sample_get_info},config:{timeoutMs:5000}}; const r=await execute({action:'get_info',filePath:'test'},ctx); assert.equal(r.metadata.success,true); });
});

describe('video-editor-ffmpeg: providerNotConfiguredError', ()=>{ beforeEach(()=>{});
  it('success false', ()=>{ assert.equal(providerNotConfiguredError().metadata.success,false); });
  it('code', ()=>{ assert.equal(providerNotConfiguredError().metadata.error.code,'PROVIDER_NOT_CONFIGURED'); });
  it('retriable false', ()=>{ assert.equal(providerNotConfiguredError().metadata.error.retriable,false); });
});

describe('video-editor-ffmpeg: constants', ()=>{ beforeEach(()=>{});
  it('VALID_ACTIONS', ()=>{ assert.deepEqual(VALID_ACTIONS,['get_info','convert','extract_audio','thumbnail']); });
});

describe('video-editor-ffmpeg: request paths', ()=>{ beforeEach(()=>{});
  it('path get_info', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_get_info;}},config:{timeoutMs:5000}}; await execute({action:'get_info',filePath:'test'},ctx); assert.ok(p!==null); });
  it('path convert', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_convert;}},config:{timeoutMs:5000}}; await execute({action:'convert',input:'test',output:'test'},ctx); assert.ok(p!==null); });
  it('path extract_audio', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_extract_audio;}},config:{timeoutMs:5000}}; await execute({action:'extract_audio',input:'test',output:'test'},ctx); assert.ok(p!==null); });
  it('path thumbnail', async()=>{ let p=null; const ctx={providerClient:{request:async(m,pa)=>{p=pa;return sample_thumbnail;}},config:{timeoutMs:5000}}; await execute({action:'thumbnail',input:'test'},ctx); assert.ok(p!==null); });
});
