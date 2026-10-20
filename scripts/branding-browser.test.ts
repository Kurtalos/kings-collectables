import assert from "node:assert/strict";
import { Pool } from "pg";
import { request, chromium, expect } from "@playwright/test";
import chromiumBinary from "@sparticuz/chromium";
import sharp from "sharp";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { brotliDecompressSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { resolve, basename } from "node:path";
import { DEFAULT_BRANDING, type BrandingRecord } from "../src/lib/branding";
import { brandingUploadDirectory } from "../src/lib/branding-images";

async function main(){
  if(!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname!=="/inventory_test")throw new Error("Only isolated inventory_test is supported.");
  const pool=new Pool({connectionString:process.env.DATABASE_URL}),base=process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
  const owner=await request.newContext({baseURL:base}),guest=await request.newContext({baseURL:base});
  const old=(await pool.query("SELECT value FROM store_meta WHERE key='store.branding.v1'")).rows[0];
  const protectedRows=(await pool.query("SELECT key,value FROM store_meta WHERE key<>'store.branding.v1' ORDER BY key")).rows;
  const costs=(await pool.query("SELECT (SELECT sum(total_cost)::text FROM products) AS products,(SELECT sum(cost_basis)::text FROM order_items) AS orders")).rows;
  const uploaded:string[]=[];let browser;
  const json=async<T,>(r:{json:()=>Promise<unknown>;ok:()=>boolean}):Promise<T>=>{const body=await r.json();assert.ok(r.ok(),JSON.stringify(body));return body as T;};
  try{
    assert.equal((await guest.get("/api/branding")).status(),401);assert.equal((await guest.put("/api/branding",{data:{settings:DEFAULT_BRANDING,revision:0}})).status(),401);
    assert.equal((await guest.post("/api/branding-images?kind=logo",{data:"invalid"})).status(),401);
    await json(await owner.post("/api/owner",{data:{password:process.env.TEST_ADMIN_PASSWORD || "inventory-test-only"}}));
    const baseline=await json<BrandingRecord>(await owner.get("/api/branding"));
    assert.equal((await owner.put("/api/branding",{headers:{origin:"https://evil.invalid"},data:{settings:DEFAULT_BRANDING,revision:baseline.revision}})).status(),400);
    assert.equal((await owner.post("/api/branding-images",{headers:{origin:"https://evil.invalid","content-type":"image/png"},data:Buffer.from("bad")})).status(),400);
    for(const patch of [{colors:{...DEFAULT_BRANDING.colors,accent:"url(https://evil.invalid)"}},{logo:"https://evil.invalid/logo.svg"},{favicon:"/favicon.svg"},{logoWidth:999},{displayFont:"<style>"},{description:"x".repeat(321)},{logo:"/api/branding-images/12345678-1234-1234-1234-123456789012.webp"}])assert.equal((await owner.put("/api/branding",{data:{settings:{...DEFAULT_BRANDING,...patch},revision:baseline.revision}})).status(),400);
    assert.equal((await owner.post("/api/branding-images?kind=logo",{headers:{"content-type":"image/svg+xml"},data:"<svg/>"})).status(),400);
    assert.equal((await owner.post("/api/branding-images?kind=logo",{headers:{"content-type":"image/png"},data:Buffer.from("bad image")})).status(),400);
    assert.equal((await owner.post("/api/branding-images?kind=logo",{headers:{"content-type":"image/png"},data:Buffer.alloc(4*1024*1024+1)})).status(),413);
    const wide=await sharp({create:{width:180,height:90,channels:4,background:"orange"}}).png().toBuffer();
    assert.equal((await owner.post("/api/branding-images?kind=icon",{headers:{"content-type":"image/png"},data:wide})).status(),400);
    const concurrent=await Promise.all([owner.put("/api/branding",{data:{settings:DEFAULT_BRANDING,revision:baseline.revision}}),owner.put("/api/branding",{data:{settings:DEFAULT_BRANDING,revision:baseline.revision}})]);assert.deepEqual(concurrent.map(r=>r.status()).sort(),[200,409]);
    const liveDefault=await json<BrandingRecord>(await owner.get("/api/branding"));
    await mkdir("artifacts/chromium-libs",{recursive:true});await writeFile("artifacts/al2023.tar",brotliDecompressSync(await readFile("node_modules/@sparticuz/chromium/bin/al2023.tar.br")));execFileSync("tar",["-xf","artifacts/al2023.tar","-C","artifacts/chromium-libs"]);
    browser=await chromium.launch({executablePath:await chromiumBinary.executablePath(),args:chromiumBinary.args,env:{...process.env,LD_LIBRARY_PATH:`${resolve("artifacts/chromium-libs/lib")}:${process.env.LD_LIBRARY_PATH || ""}`},headless:true});
    const context=await browser.newContext({viewport:{width:1600,height:1100}});await context.addCookies((await owner.storageState()).cookies);const page=await context.newPage(),errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto(base+"/admin",{waitUntil:"networkidle"});await page.getByRole("button",{name:"Store",exact:true}).click();await page.getByRole("button",{name:"Theme & branding",exact:true}).click();
    await expect(page.getByLabel("Branding theme preset",{exact:true})).toHaveValue("inherit");await page.getByLabel("Branding theme preset",{exact:true}).selectOption("forest");await page.getByLabel("Use custom colours",{exact:true}).check();
    await page.getByLabel("Accent hex",{exact:true}).fill("#123456");await expect(page.locator(".branding-preview")).toHaveCSS("--wine","#123456");
    const beforeWheel=await page.getByLabel("Accent hex",{exact:true}).inputValue();await page.getByRole("slider",{name:"Colour wheel hue",exact:true}).focus();await page.keyboard.press("ArrowRight");assert.notEqual(await page.getByLabel("Accent hex",{exact:true}).inputValue(),beforeWheel);
    const wheel=await page.locator(".branding-wheel").boundingBox();assert.ok(wheel);await page.mouse.move(wheel.x+wheel.width/2,wheel.y+wheel.height/2);await page.mouse.down();await page.mouse.move(wheel.x+wheel.width*.8,wheel.y+wheel.height*.25);await page.mouse.up();
    await page.getByLabel("Accent hex",{exact:true}).fill("#123456");await page.getByLabel("Accent hover hex",{exact:true}).fill("#234567");await page.getByLabel("Page background hex",{exact:true}).fill("#111111");await expect(page.locator(".branding-contrast")).toContainText("low contrast");await page.getByLabel("Page background hex",{exact:true}).fill("#f6f3ee");
    await page.getByLabel("Display font",{exact:true}).selectOption("sans");await page.getByLabel("Button shape",{exact:true}).selectOption("rounded");await page.getByLabel("Logo display",{exact:true}).selectOption("with-name");await page.getByLabel("Logo width",{exact:true}).fill("220");await page.getByLabel("Browser title tagline",{exact:true}).fill("Collect your next favourite");await page.getByLabel("Default site description",{exact:true}).fill("A test store for collectors.");
    for(const [label,kind,color] of [["Main logo (light surfaces)","logo","#f26b0a"],["Dark-background logo","logo","#ffffff"],["Favicon / browser icon","icon","#f5c518"]]){
      const bytes=await sharp({create:{width:128,height:128,channels:4,background:color}}).png().toBuffer(),response=page.waitForResponse(r=>r.url().includes(`/api/branding-images?kind=${kind}`) && r.request().method()==="POST");
      await page.getByLabel(label,{exact:true}).setInputFiles({name:"branding-test.png",mimeType:"image/png",buffer:bytes});const result=await json<{image:string}>(await response);uploaded.push(result.image);await expect(page.locator(".branding-save")).toContainText("Image uploaded to the preview");
    }
    assert.equal((await json<BrandingRecord>(await owner.get("/api/branding"))).revision,liveDefault.revision,"Draft/upload must not publish");
    const homeBefore=await guest.get("/");assert.ok(!(await homeBefore.text()).includes("Collect your next favourite"));
    page.once("dialog",d=>d.dismiss());await page.getByRole("button",{name:"Inventory",exact:true}).click();await expect(page.getByRole("heading",{name:"Theme & branding",exact:true})).toBeVisible();
    await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
    await page.screenshot({path:"artifacts/theme-branding-desktop.png",fullPage:true,animations:"disabled"});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Desktop overflow");
    await page.getByRole("button",{name:"Mobile branding preview",exact:true}).click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:"artifacts/theme-branding-mobile.png",fullPage:true,animations:"disabled"});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Editor mobile overflow");
    await page.getByRole("button",{name:"Save branding",exact:true}).click();await expect(page.locator(".branding-save")).toContainText("Branding saved");
    const saved=await json<BrandingRecord>(await owner.get("/api/branding"));assert.equal(saved.settings.colors.accent,"#123456");assert.equal(saved.settings.logo,uploaded[0]);assert.equal(saved.settings.darkLogo,uploaded[1]);assert.equal(saved.settings.favicon,uploaded[2]);assert.equal(saved.settings.logoWidth,220);
    await page.reload({waitUntil:"networkidle"});await page.getByRole("button",{name:"Store",exact:true}).click();await page.getByRole("button",{name:"Theme & branding",exact:true}).click();await expect(page.getByLabel("Accent hex",{exact:true})).toHaveValue("#123456");
    await expect(page.locator(".sidebar-brand .brand-image")).toHaveAttribute("src",uploaded[1]);
    const image=await guest.get(uploaded[2]);assert.match(image.headers()["content-type"],/image\/png/);assert.match(image.headers()["cache-control"],/immutable/);assert.equal(image.headers()["x-content-type-options"],"nosniff");const metadata=await sharp(await image.body()).metadata();assert.equal(metadata.width,512);
    await page.goto(base,{waitUntil:"networkidle"});await expect(page.locator("html")).toHaveAttribute("data-store-theme","forest");await expect(page.locator("html")).toHaveCSS("--wine","#123456");await expect(page.locator(".header-main .brand-image")).toHaveAttribute("src",uploaded[1]);await expect(page.locator(".footer-brand .brand-image")).toHaveAttribute("src",uploaded[1]);assert.ok(await page.locator('link[rel="icon"]').evaluateAll((elements,url)=>elements.some(e=>e.getAttribute("href")===url),uploaded[2]));await expect(page).toHaveTitle(/Collect your next favourite/);await expect(page.locator('meta[name="description"]')).toHaveAttribute("content","A test store for collectors.");assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Storefront mobile logo overflow");await page.screenshot({path:"artifacts/theme-branding-storefront-mobile.png",fullPage:true,animations:"disabled"});
    for(const width of [1600,1024,768,390]) {await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Storefront logo overflow at ${width}px`);}
    await page.setViewportSize({width:390,height:844});
    await page.goto(base+"/checkout",{waitUntil:"networkidle"});await expect(page.locator(".checkout-header .brand-image")).toHaveAttribute("src",uploaded[0]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Checkout mobile logo overflow");
    await page.goto(base+"/admin",{waitUntil:"networkidle"});await page.getByRole("button",{name:"Store",exact:true}).click();await page.getByRole("button",{name:"Theme & branding",exact:true}).click();await expect(page.getByLabel("Accent hex",{exact:true})).toHaveValue("#123456");
    await json(await owner.put("/api/branding",{data:{settings:{...saved.settings,tagline:"Updated elsewhere"},revision:saved.revision}}));await page.getByLabel("Accent hex",{exact:true}).fill("#345678");await page.getByRole("button",{name:"Save branding",exact:true}).click();await expect(page.locator(".branding-save").getByRole("alert")).toContainText("another session");assert.equal((await json<BrandingRecord>(await owner.get("/api/branding"))).settings.tagline,"Updated elsewhere");
    page.once("dialog",d=>d.accept());await page.getByRole("button",{name:"Reload branding",exact:true}).click();await expect(page.getByLabel("Browser title tagline",{exact:true})).toHaveValue("Updated elsewhere");
    await page.getByRole("button",{name:"Remove icon",exact:true}).click();await expect(page.getByAltText("Browser icon preview",{exact:true})).toHaveCount(0);assert.equal((await json<BrandingRecord>(await owner.get("/api/branding"))).settings.favicon,uploaded[2]);
    page.once("dialog",d=>d.accept());await page.getByRole("button",{name:"Discard changes",exact:true}).click();await expect(page.getByAltText("Browser icon preview",{exact:true})).toHaveAttribute("src",uploaded[2]);
    page.once("dialog",d=>d.accept());await page.getByRole("button",{name:"Reset to defaults",exact:true}).click();await expect(page.getByLabel("Branding theme preset",{exact:true})).toHaveValue("inherit");await page.getByRole("button",{name:"Save branding",exact:true}).click();await expect(page.locator(".branding-save")).toContainText("Branding saved");await page.goto(base,{waitUntil:"networkidle"});await expect(page.locator(".header-main .brand-image")).toHaveCount(0);assert.ok(await page.locator('link[rel="icon"]').evaluateAll(elements=>elements.some(e=>e.getAttribute("href")==="/favicon.svg")));
    assert.deepEqual((await pool.query("SELECT key,value FROM store_meta WHERE key<>'store.branding.v1' ORDER BY key")).rows,protectedRows);assert.deepEqual((await pool.query("SELECT (SELECT sum(total_cost)::text FROM products) AS products,(SELECT sum(cost_basis)::text FROM order_items) AS orders")).rows,costs);assert.deepEqual(errors,[]);
    console.log("PASS: branding owner/CSRF protection, upload decode/type/size/square checks, concurrent revisions, isolated colour-wheel/hex/font/logo/icon preview, unsaved navigation guard, save/reload/stale conflict, desktop/mobile, public branding and metadata, correct dark/light logos, reset, settings/cost preservation and no page errors.");
  }finally{
    await browser?.close();if(old)await pool.query("INSERT INTO store_meta(key,value) VALUES('store.branding.v1',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[old.value]);else await pool.query("DELETE FROM store_meta WHERE key='store.branding.v1'");
    for(const url of uploaded)await rm(resolve(brandingUploadDirectory(),basename(url)),{force:true});await owner.dispose();await guest.dispose();await pool.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
