const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash, randomUUID } = require("node:crypto");
const ts = require("typescript");
function storage() {
  const values = new Map();
  return { values, getItem: async (key) => values.get(key) ?? null, setItem: async (key,value) => { values.set(key,value); }, removeItem: async (key) => { values.delete(key); }, getAllKeys: async () => [...values.keys()] };
}
function helper(store, platform = "ios") {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,"../../src/lib/checkout-request.ts"),"utf8"),{ compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText;
  const exports = {};
  vm.runInNewContext(code,{ exports, localStorage: {getItem: (key)=>store.values.get(key)??null,setItem: (key,value)=>store.values.set(key,value),removeItem:(key)=>store.values.delete(key)}, require: (name) => {
    if (name === "expo-secure-store") return { getItemAsync:(key)=>store.getItem(key),setItemAsync:(key,value)=>store.setItem(key,value),deleteItemAsync:(key)=>store.removeItem(key) };
    if (name === "react-native") return { Platform:{OS:platform} };
    if (name === "expo-crypto") return { CryptoDigestAlgorithm:{SHA256:"SHA-256"}, randomUUID, digestStringAsync: async (_algorithm,value) => createHash("sha256").update(value).digest("hex") };
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return exports;
}
const body = { booking_id:"",client_id:"private-client",client_name:"Private name",staff_id:"staff",items:[{kind:"product",product_id:"product",qty:1}],method:"cash",tip_cents:100 };
test("mobile: save before API submit, concurrent retries share ID, app restart keeps ID, acknowledged receipt cleans up", async () => {
  const store=storage(), api=helper(store);
  const requests=await Promise.all(Array.from({length:6},()=>api.checkoutRequest(body,"business","merchant","client")));
  assert.equal(new Set(requests.map((r)=>r.id)).size,1);
  assert.equal(store.values.size,2); // Opaque ID and scope index.
  assert.match(requests[0].key,/^lx_checkout\.[a-f0-9]{64}\.[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify([...store.values]).includes("Private"));
  const restarted=helper(store), retry=await restarted.checkoutRequest(body,"business","merchant","client");
  assert.equal(retry.id,requests[0].id);
  assert.equal((await restarted.pendingCheckouts("business","merchant","client"))[0].id,retry.id);
  await restarted.completeCheckout(retry);
  assert.equal(store.values.size,0);
  assert.notEqual((await restarted.checkoutRequest(body,"business","merchant","client")).id,retry.id);
});
test("mobile: scope by business, merchant and customer and distinguish changed tickets", async () => {
  const api=helper(storage()), first=await api.checkoutRequest(body,"business","merchant","client");
  for (const scope of [["other","merchant","client"],["business","other","client"],["business","merchant","other"]]) assert.notEqual((await api.checkoutRequest(body,...scope)).id,first.id);
  assert.notEqual((await api.checkoutRequest({...body,tip_cents:200},"business","merchant","client")).id,first.id);
  assert.equal((await api.pendingCheckouts("business","merchant","client")).length,2);
  await assert.rejects(api.checkoutRequest(body,"","merchant","client"),/Reload your business session/);
});
test("mobile: storage failure refuses submit, recovered storage retries; cleanup failures retain replay capability", async () => {
  const store=storage(), set=store.setItem;
  store.setItem=async()=>{throw new Error("storage denied");};
  const api=helper(store);
  await assert.rejects(api.checkoutRequest(body,"business","merchant","client"),/could not save/);
  store.setItem=set;
  const request=await api.checkoutRequest(body,"business","merchant","client");
  store.removeItem=async()=>{throw new Error("cleanup denied");};
  await api.completeCheckout(request);
  assert.equal((await helper(store).checkoutRequest(body,"business","merchant","client")).id,request.id);
});
test("mobile web: localStorage persists opaque recovery across reload without invoking native SecureStore", async () => {
  const store=storage();
  store.getItem=store.setItem=store.removeItem=async()=>{throw new Error("Native SecureStore must not be called on web");};
  const api=helper(store,"web");
  const first=await api.checkoutRequest(body,"business","merchant","client");
  const reloaded=helper(store,"web");
  assert.equal((await reloaded.checkoutRequest(body,"business","merchant","client")).id,first.id);
  const pending=await reloaded.pendingCheckouts("business","merchant","client");
  assert.equal(pending.length,1); assert.equal(pending[0].id,first.id);
  await reloaded.completeCheckout(first);
  assert.equal(store.values.size,0);
});
