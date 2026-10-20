import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryOptions, enabledDeliveryOptions, deliveryCost, deliveryQuote, chooseDelivery, trackingFields, validateDeliveryOptions } from "../src/lib/delivery";
import { DEFAULT_STORE_SETTINGS, validateStoreSettings } from "../src/lib/store-settings";
const standard=deliveryOptions(DEFAULT_STORE_SETTINGS)[0];
test("legacy delivery is preserved; enabled service selection and per-option thresholds are authoritative",()=>{
 assert.equal(standard.price,895);assert.equal(deliveryCost(9999,standard),895);assert.equal(deliveryCost(10000,standard),0);
 const express={...standard,id:"express",price:1800,freeAbove:null},settings={...DEFAULT_STORE_SETTINGS,deliveryOptions:[standard,express]};
 assert.throws(()=>chooseDelivery(settings,undefined));assert.equal(chooseDelivery(settings,"express").price,1800);assert.equal(deliveryCost(99999,express),1800);
 assert.equal(deliveryCost(0,{...standard,freeAbove:0}),0);assert.equal(deliveryCost(1,{...standard,price:0,freeAbove:null}),0);
 assert.throws(()=>chooseDelivery({...settings,deliveryOptions:[{...express,enabled:false}]},"express"));assert.throws(()=>chooseDelivery({...settings,deliveryOptions:[]},undefined));
 assert.equal(enabledDeliveryOptions({...settings,deliveryOptions:[standard,{...express,enabled:false}]}).length,1);
 assert.notEqual(deliveryQuote(standard,500),deliveryQuote({...standard,name:"Renamed"},500));
});
test("delivery validation bounds prices, IDs, text, booleans and number of options",()=>{
 assert.deepEqual(validateDeliveryOptions([standard]),[standard]);assert.deepEqual(validateDeliveryOptions([]),[]);
 for(const patch of [{id:"../bad"},{price:-1},{price:1.5},{price:"895"},{freeAbove:1000001},{enabled:"true"},{trackingEnabled:1},{name:""},{name:"x".repeat(81)},{carrier:"bad\ncarrier"}])assert.throws(()=>validateDeliveryOptions([{...standard,...patch}]));
 assert.throws(()=>validateDeliveryOptions([standard,standard]));assert.throws(()=>validateDeliveryOptions(Array(13).fill(standard)));
 assert.equal(validateStoreSettings({...DEFAULT_STORE_SETTINGS,deliveryOptions:[standard]}).deliveryOptions?.[0].id,standard.id);
});
test("tracking fields allow clearing, trim text and reject unsafe links",()=>{
 assert.equal(trackingFields({trackingNumber:" ABC123 ",trackingUrl:"https://example.invalid/track?id=ABC123",carrier:" Postal "}).carrier,"Postal");
 assert.equal(trackingFields({trackingNumber:"",trackingUrl:"",carrier:""}).trackingNumber,"");
 for(const trackingUrl of ["javascript:alert(1)","http://example.invalid","https://user:password@example.invalid","not a URL"])assert.throws(()=>trackingFields({trackingNumber:"A",trackingUrl,carrier:""}));
 assert.throws(()=>trackingFields({trackingNumber:"",trackingUrl:"https://example.invalid",carrier:""}));
 assert.throws(()=>trackingFields({trackingNumber:"x".repeat(121),trackingUrl:"",carrier:""}));
});
