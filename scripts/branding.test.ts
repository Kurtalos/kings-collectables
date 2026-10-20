import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { DEFAULT_BRANDING, validateBranding, brandingVariables, readableText, contrast, rgbToHSV, hsvToHex, BRAND_IMAGE_PATTERN } from "../src/lib/branding";
import { DEFAULT_STORE_SETTINGS, STORE_THEMES, themeVariables } from "../src/lib/store-settings";
import { MAX_BRAND_BYTES, storeBrandingImage, readBrandingImage, checkBrandingImage } from "../src/lib/branding-images";
test("branding defaults inherit previous palettes without replacing unrelated settings",()=>{
  for(const theme of Object.keys(STORE_THEMES) as (keyof typeof STORE_THEMES)[]){const styles=brandingVariables(DEFAULT_BRANDING,theme);for(const [key,value] of Object.entries(themeVariables(theme)))assert.equal(styles[key],value);}
  assert.equal(validateBranding(DEFAULT_BRANDING).preset,null);
  assert.equal(DEFAULT_STORE_SETTINGS.shippingFlat,895);
});
test("branding accepts allowlisted fields only and rejects CSS/URLs/type/size injection",()=>{
  assert.equal(validateBranding({...DEFAULT_BRANDING,description:"A store\nfor collectors."}).description,"A store for collectors.");
  assert.equal(validateBranding({...DEFAULT_BRANDING,colors:{...DEFAULT_BRANDING.colors,accent:"#AABBCC"}}).colors.accent,"#aabbcc");
  for(const patch of [{preset:"__proto__"},{customColors:"true"},{colors:{...DEFAULT_BRANDING.colors,accent:"red; color:transparent"}},{logo:"https://evil.invalid/x.png"},{darkLogo:"javascript:alert(1)"},{favicon:"/favicon.svg"},{logo:"/api/branding-images/../../secret.webp"},{favicon:"/api/branding-images/12345678-1234-1234-1234-123456789012.webp"},{logoWidth:79},{logoWidth:221},{logoWidth:100.5},{displayFont:"url(https://evil.invalid)"},{buttonShape:"999px"},{logoMode:"html"},{tagline:"x".repeat(121)},{description:"bad\u0000text"}])assert.throws(()=>validateBranding({...DEFAULT_BRANDING,...patch}));
});
test("colour conversions, contrast and CSS token generation are deterministic",()=>{
  for(const hex of ["#ffffff","#000000","#f26b0a","#00ffff","#123456"]){const {h,s,v}=rgbToHSV(hex);assert.equal(hsvToHex(h,s,v),hex);}
  for(let i=0;i<256;i++){const c="#"+i.toString(16).padStart(2,"0").repeat(3);assert.ok(contrast(c,readableText(c))>=4.5);}
  assert.equal(contrast("#000000","#ffffff"),21);assert.equal(readableText("#000000"),"#ffffff");assert.equal(readableText("#ffff00"),"#000000");
  const styles=brandingVariables({...DEFAULT_BRANDING,customColors:true,colors:{...DEFAULT_BRANDING.colors,accent:"#000000",hover:"#ffffff"},displayFont:"sans",buttonShape:"rounded"},"classic");
  assert.equal(styles["--accent-text"],"#ffffff");assert.equal(styles["--brand-hover-text"],"#000000");assert.equal(styles["--brand-button-radius"],"18px");assert.match(styles["--serif"],/Manrope/);
});
test("logo/icon uploads decode and re-encode, enforce bounds and reject path traversal",async()=>{
  await mkdir("artifacts",{recursive:true});
  const before=process.env.BRANDING_UPLOAD_DIR, directory=await mkdtemp(resolve("artifacts/branding-unit-"));process.env.BRANDING_UPLOAD_DIR=directory;
  try{
    const bytes=await sharp({create:{width:128,height:128,channels:4,background:{r:255,g:100,b:10,alpha:0.6}}}).png().toBuffer();
    const logo=await storeBrandingImage(bytes,"image/png","logo");assert.match(logo,BRAND_IMAGE_PATTERN);assert.match(logo,/\.webp$/);await checkBrandingImage(logo);
    const image=await readBrandingImage(logo.split("/").at(-1)!);assert.ok(image);const meta=await sharp(image).metadata();assert.equal(meta.format,"webp");assert.equal(meta.hasAlpha,true);
    const icon=await storeBrandingImage(bytes,"image/png","icon"), iconBytes=await readBrandingImage(icon.split("/").at(-1)!);assert.ok(iconBytes);const im=await sharp(iconBytes).metadata();assert.equal(im.width,512);assert.equal(im.height,512);assert.equal(im.format,"png");
    for(const mime of ["image/svg+xml","image/gif","image/x-icon"])await assert.rejects(storeBrandingImage(bytes,mime,"logo"));
    await assert.rejects(storeBrandingImage(Buffer.from("not a png"),"image/png","logo"));await assert.rejects(storeBrandingImage(bytes,"image/png","bad"));await assert.rejects(storeBrandingImage(Buffer.alloc(MAX_BRAND_BYTES+1),"image/png","logo"));
    const wide=await sharp({create:{width:128,height:64,channels:3,background:"red"}}).png().toBuffer();await assert.rejects(storeBrandingImage(wide,"image/png","icon"),/square/);
    const tiny=await sharp({create:{width:32,height:32,channels:3,background:"red"}}).png().toBuffer();await assert.rejects(storeBrandingImage(tiny,"image/png","icon"),/64/);
    assert.equal(await readBrandingImage("../../.env"),null);assert.equal(await readBrandingImage("nonsense.webp"),null);
    await assert.rejects(checkBrandingImage("/api/branding-images/12345678-1234-1234-1234-123456789012.webp"),/missing/);
  }finally{if(before===undefined)delete process.env.BRANDING_UPLOAD_DIR;else process.env.BRANDING_UPLOAD_DIR=before;await rm(directory,{recursive:true,force:true});}
});
