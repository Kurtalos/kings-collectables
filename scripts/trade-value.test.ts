import { test } from "node:test";
import assert from "node:assert/strict";
import { tradeUnitValue,tradeOfferTotal } from "../src/lib/trade-value";
import { DEFAULT_STORE_SETTINGS,validateStoreSettings } from "../src/lib/store-settings";
test("trade settings have a legacy default and bounded whole percentages",()=>{
 const {tradeInPercent:_,...legacy}=DEFAULT_STORE_SETTINGS;assert.equal(validateStoreSettings(legacy).tradeInPercent,50);
 for(const v of [0,30,50,100])assert.equal(validateStoreSettings({...legacy,tradeInPercent:v}).tradeInPercent,v);
 for(const v of [-1,101,50.5,"50",null,NaN])assert.throws(()=>validateStoreSettings({...legacy,tradeInPercent:v}));
});
test("suggested per-copy credit rounds exact cents before multiplying quantity",()=>{
 assert.equal(tradeUnitValue(2000,30),600);assert.equal(tradeUnitValue(999,50),500);assert.equal(tradeUnitValue(0,50),0);assert.equal(tradeUnitValue(2000,0),0);assert.equal(tradeUnitValue(2000,100),2000);
 assert.deepEqual(tradeOfferTotal("5.00","3"),{unit:500,quantity:3,amount:1500});assert.deepEqual(tradeOfferTotal("7.25","2"),{unit:725,quantity:2,amount:1450});
 for(const pair of [[-1,50],[1,101],[1,0.5],[1.1,50]])assert.throws(()=>tradeUnitValue(...pair as [number,number]));
});
test("manual offers and quantities enforce the existing trade credit limits",()=>{
 assert.equal(tradeOfferTotal("10000","1").amount,1000000);
 for(const [offer,qty] of [["0","1"],["1.001","1"],["1","0"],["1","1000"],["1","1.5"],["10000","2"],["-1","1"],["","1"]])assert.throws(()=>tradeOfferTotal(offer,qty));
});
