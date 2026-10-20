import { test } from "node:test";
import assert from "node:assert/strict";
import { validateStocktake,stocktakeLines,parseStocktakeDraft } from "../src/lib/stocktake";
const id="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",requestId="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const valid={requestId,reason:"Physical stocktake",lines:[{productId:id,expected:5,counted:0}]};
test("stocktake accepts explicit zero, checked matches, canonical IDs and bounded whole quantities",()=>{
 assert.deepEqual(validateStocktake(valid),valid);assert.equal(validateStocktake({...valid,requestId:requestId.toUpperCase(),lines:[{productId:id.toUpperCase(),expected:0,counted:1000000}]}).lines[0].productId,id);
 for(const n of [-1,1.5,1000001,"1",null,NaN])assert.throws(()=>validateStocktake({...valid,lines:[{productId:id,expected:1,counted:n}]}));
 for(const patch of [{requestId:"bad"},{reason:""},{reason:"a".repeat(301)},{lines:[]},{lines:Array(501).fill(valid.lines[0])},{lines:[valid.lines[0],{...valid.lines[0],productId:id.toUpperCase()}]}])assert.throws(()=>validateStocktake({...valid,...patch}));
});
test("local drafts preserve invalid input for correction, frozen retries and exact expected snapshots",()=>{
 const card={id,name:"Test",setName:"Test",setCode:"tst",collectorNumber:"1",condition:"Near mint",finish:"Non-foil",imageUrl:"/favicon.svg",quantity:5};
 const draft={[id]:{card,count:"0"}},state={version:1,draft,checked:{[id]:4},attempt:valid,reason:valid.reason};assert.deepEqual(stocktakeLines(draft),valid.lines);assert.equal(parseStocktakeDraft(JSON.stringify(state)).attempt?.requestId,requestId);
 const invalid={[id]:{card,count:"1.5"}};assert.throws(()=>stocktakeLines(invalid));assert.equal(parseStocktakeDraft(JSON.stringify({...state,draft:invalid})).draft[id].count,"1.5");
 assert.throws(()=>parseStocktakeDraft('{"version":9}'));assert.throws(()=>parseStocktakeDraft(JSON.stringify({...state,attempt:{...valid,requestId:"bad"}})));
});
