const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const renderer = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let owner = {clientToken:'first-account',businessToken:null};
function loadTs(relative, overrides={}) {
  const filename = path.resolve(relative);
  const m = new Module(filename, module);
  m.filename=filename; m.paths=Module._nodeModulePaths(path.dirname(filename));
  const original=m.require.bind(m);
  m.require=(name)=>Object.hasOwn(overrides,name)?overrides[name]:original(name);
  m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,filename);
  return m.exports;
}
const {useLoad}=loadTs('src/lib/use-load.ts',{'./session':{useSession:()=>owner}});
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no});return {promise,resolve,reject}};
const tick=()=>new Promise(ok=>setImmediate(ok));
let current, tree;
function Probe({loader,route}) {const result=useLoad(loader,[route]);React.useEffect(()=>{current=result},[result]);return React.createElement('data',null,result.data?.secret??'none')}
async function render(loader,route) {await renderer.act(async()=>{const el=React.createElement(Probe,{loader,route});if(tree)tree.update(el);else tree=renderer.create(el);await tick()})}
(async()=>{
  const old=deferred();await render(()=>old.promise,'bookings');
  owner={...owner,clientToken:'second-account'};
  const fresh=deferred();await render(()=>fresh.promise,'bookings');
  assert.equal(current.data,null,'account switch must clear private data immediately');
  await renderer.act(async()=>{old.resolve({secret:'first account'});await tick()});
  assert.equal(current.data,null,'late old-account result must never become visible');
  await renderer.act(async()=>{fresh.resolve({secret:'second account'});await tick()});
  assert.equal(current.data.secret,'second account');
  const changed=deferred();await render(()=>changed.promise,'another-booking');
  assert.equal(current.data,null,'route switch must clear old booking');
  await renderer.act(async()=>{changed.reject(new Error('offline'));await tick()});
  assert.equal(current.error,'offline');assert.equal(current.loading,false);
  owner={...owner,clientToken:null};await render(async()=>null,'another-booking');
  assert.equal(current.data,null);assert.equal(current.error,'','old errors do not leak into guest session');
  await renderer.act(async()=>tree.unmount());
  const {api,ApiError}=loadTs('src/lib/api.ts');
  const originalFetch=globalThis.fetch, originalTimer=globalThis.setTimeout;
  try {
    globalThis.setTimeout=(fn)=>originalTimer(fn,5);
    globalThis.fetch=async(_url,options)=>new Promise((_ok,no)=>options.signal.addEventListener('abort',()=>no(new Error('aborted'))));
    await assert.rejects(api('/auth/me'),e=>e instanceof ApiError&&e.status===0,'stalled network must finish with retryable error');
    globalThis.fetch=async()=>({ok:true,text:async()=>{throw new Error('body dropped')}});
    await assert.rejects(api('/auth/me'),e=>e instanceof ApiError&&e.status===0,'body-read disconnect must be normalized too');
  } finally {globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer}
  const values=new Map();
  globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  let delayedMe=null, delayedCall=null;
  const fakeApi=async (url,options={})=>{
    if(url==='/auth/me?brief=1') return delayedMe ? delayedMe.promise : {user:{id:options.token}};
    if(url==='/waiting') return delayedCall.promise;
    return {};
  };
  const sessions=loadTs('src/lib/session.tsx',{'react-native':{Platform:{OS:'web'}},'expo-secure-store':{},'./api':{api:fakeApi,ApiError}});
  let session;
  function SessionProbe(){const result=sessions.useSession();React.useEffect(()=>{session=result},[result]);return React.createElement('span',null,result.clientToken??'guest')}
  await renderer.act(async()=>{tree=renderer.create(React.createElement(sessions.SessionProvider,null,React.createElement(SessionProbe)));await tick()});
  await renderer.act(async()=>{await session.signInClientToken('account-A')});
  delayedMe=deferred();
  const refresh=session.refresh();
  await renderer.act(async()=>{await session.signOut('client')});
  await renderer.act(async()=>{delayedMe.resolve({user:{id:'account-A'}});await refresh});
  assert.equal(session.clientToken,null,'late refresh cannot resurrect signed-out account');
  delayedMe=null;
  await renderer.act(async()=>{await session.signInClientToken('account-B')});
  delayedCall=deferred();
  const oldRequest=session.capi('/waiting').catch(e=>e);
  await renderer.act(async()=>{await session.signInClientToken('account-C')});
  await renderer.act(async()=>{delayedCall.reject(new ApiError(401,'expired'));await oldRequest});
  assert.equal(session.clientToken,'account-C','old session 401 must not sign out new account');
  assert.equal(values.get('lx_client_token'),'account-C','old session 401 must not erase new secure token');
  await renderer.act(async()=>tree.unmount());
  const crypto=require('node:crypto');
  const stored=new Map();
  const store={getItemAsync:async k=>stored.get(k)??null,setItemAsync:async(k,v)=>{stored.set(k,v)},deleteItemAsync:async k=>{stored.delete(k)}};
  const {sendBooking}=loadTs('src/lib/booking-request.ts',{
    'react-native':{Platform:{OS:'android'}},'expo-secure-store':store,
    'expo-crypto':{CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(_,s)=>crypto.createHash('sha256').update(s).digest('hex'),randomUUID:crypto.randomUUID}
  });
  let firstID;const payload={business_slug:'studio',starts_at:'2030-01-01T12:00:00Z'};
  await assert.rejects(sendBooking('A',payload,async b=>{firstID=b.request_id;throw new Error('lost response')}));
  assert.equal(stored.size,1,'uncertain booking request remains on device');
  await sendBooking('A',payload,async b=>{assert.equal(b.request_id,firstID,'retry reuses durable request ID');return {booking:'same'}});
  assert.equal(stored.size,0,'successful booking clears pending request');
  await sendBooking('B',payload,async b=>{assert.notEqual(b.request_id,firstID,'another account gets a different request');return {}});
  const {useFormReset}=loadTs('src/lib/form-reset.ts');let editValue;let setEdit;
  function FormProbe({id,open}){const [value,setValue]=React.useState('');useFormReset([id,open],()=>{if(open)setValue(id)});React.useEffect(()=>{setEdit=setValue;editValue=value},[value]);return React.createElement('span',null,value)}
  await renderer.act(async()=>{tree=renderer.create(React.createElement(FormProbe,{id:'one',open:true}))});
  assert.equal(editValue,'one');await renderer.act(async()=>{setEdit('typed value')});assert.equal(editValue,'typed value','typing must not reset a form');
  await renderer.act(async()=>tree.update(React.createElement(FormProbe,{id:'two',open:true})));assert.equal(editValue,'two','changing record resets form before display');
  await renderer.act(async()=>tree.unmount());
  console.log('PASS: durable booking retries, account-scoped request IDs and form reset behaviour');
  console.log('PASS: account isolation, late responses, route isolation, retry state, sign-out, timeout, body disconnect, expired-session isolation and late-refresh sign-out');
})().catch(e=>{console.error(e);process.exitCode=1});
