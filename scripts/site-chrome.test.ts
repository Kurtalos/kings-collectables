import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SITE_CHROME,validateSiteChrome,chromeTokens } from "../src/lib/site-chrome";
import { richText } from "../src/lib/pages";
test("defaults validate and preserve functional navigation, automatic shipping and dynamic footer tokens",()=>{
 assert.deepEqual(validateSiteChrome(DEFAULT_SITE_CHROME),DEFAULT_SITE_CHROME);
 assert.equal(DEFAULT_SITE_CHROME.announcementMode,"automatic");assert.equal(DEFAULT_SITE_CHROME.headerLinks.length,7);assert.equal(DEFAULT_SITE_CHROME.footerColumns.length,3);
 assert.equal(chromeTokens(richText("{year} {storeName} {year}"),"Shop {year}",2026).content?.[0].content?.[0].text,"2026 Shop {year} 2026");
});
test("reject unsafe URLs, duplicate IDs, unsupported actions, bad switches, lengths and oversized arrays",()=>{
 for(const href of ["javascript:alert(1)","//evil.invalid","http://evil.invalid","https://user:pass@example.invalid","/\\evil.invalid"]){assert.throws(()=>validateSiteChrome({...DEFAULT_SITE_CHROME,headerLinks:[{...DEFAULT_SITE_CHROME.headerLinks[0],href}]}));}
 for(const patch of [{headerPages:"yes"},{announcementMode:"script"},{origin:"x".repeat(101)},{headerLinks:Array(13).fill(DEFAULT_SITE_CHROME.headerLinks[0])},{footerColumns:Array(5).fill(DEFAULT_SITE_CHROME.footerColumns[0])},{headerLinks:[DEFAULT_SITE_CHROME.headerLinks[0],DEFAULT_SITE_CHROME.headerLinks[0]]},{headerLinks:[{...DEFAULT_SITE_CHROME.headerLinks[0],kind:"tracker"}]},{headerLinks:[DEFAULT_SITE_CHROME.headerLinks[1],{...DEFAULT_SITE_CHROME.headerLinks[1],id:"second"}]},{setLinks:[{...DEFAULT_SITE_CHROME.headerLinks[1]}]},{footerColumns:[{id:"test",title:"Test",links:[{...DEFAULT_SITE_CHROME.headerLinks[0],enabled:0}]}]}])assert.throws(()=>validateSiteChrome({...DEFAULT_SITE_CHROME,...patch}));
});
test("rich text is allowlisted, inline announcements constrained, arbitrary attributes stripped",()=>{
 assert.throws(()=>validateSiteChrome({...DEFAULT_SITE_CHROME,footerIntro:{type:"doc",content:[{type:"script",text:"alert(1)"}]}}));
 assert.throws(()=>validateSiteChrome({...DEFAULT_SITE_CHROME,announcement:{type:"doc",content:[{type:"heading",attrs:{level:2},content:[{type:"text",text:"Too big"}]}]}}));
 assert.throws(()=>validateSiteChrome({...DEFAULT_SITE_CHROME,announcement:richText("x".repeat(501))}));
 const parsed=validateSiteChrome({...DEFAULT_SITE_CHROME,footerIntro:{type:"doc",content:[{type:"paragraph",attrs:{onclick:"alert(1)"},content:[{type:"text",text:"Safe"}]}]}});assert.equal(JSON.stringify(parsed.footerIntro).includes("onclick"),false);
 const safe=validateSiteChrome({...DEFAULT_SITE_CHROME,headerLinks:[{...DEFAULT_SITE_CHROME.headerLinks[0],href:"https://example.invalid/path"}],footerColumns:[]});assert.equal(safe.footerColumns.length,0);
});
