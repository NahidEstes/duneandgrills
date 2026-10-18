import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { changeLanguage, t, catalogText, formatDate, normalizeDigits, isCustomerPath } from "../src/i18n/core.js";
import { filterMenu } from "../src/utils/menuFilters.js";
import { displayOpeningTime } from "../src/utils/visitUs.js";
test("customer language uses explicit catalog fallback, translated search and Riyadh Gregorian dates",()=>{
 const product={name:"Original burger",description:"Original details",price:24,translations:{en:{name:"English burger"},ar:{name:"برجر مشوي",description:"لحم مشوي"}}};const before=structuredClone(product);
 try{changeLanguage("ar");assert.equal(catalogText(product),"برجر مشوي");assert.equal(catalogText({name:"Original",translations:{en:{name:"Fallback"}}}),"Fallback");assert.equal(filterMenu([product],{search:"مشوي"}).length,1);assert.equal(t("Forgot password?"),"نسيت كلمة المرور؟");assert.ok(t("Try again in {0} seconds",[12]).includes("12"));assert.match(formatDate("2026-10-18T22:30:00Z"),/١٩/);assert.equal(normalizeDigits("١٢٫٣"),"12.3");changeLanguage("en");assert.equal(catalogText(product),"English burger");assert.match(formatDate("2026-10-18T22:30:00Z"),/19 Oct 2026/);assert.deepEqual(product,before);}finally{changeLanguage("en");}
});
test("Arabic customer navigation, status labels and restaurant wall-clock times are translated", () => {
 try { changeLanguage("ar"); for (const key of ["Favorites", "Reviews", "Addresses", "Settings", "Pending", "Failed"]) assert.notEqual(t(key), key); assert.match(displayOpeningTime("23:15"), /١١:١٥/); changeLanguage("en"); assert.equal(displayOpeningTime("23:15"), "11:15 PM"); } finally { changeLanguage("en"); }
});
test("translation parameters preserve customer input and English accessible names", () => {
 try { changeLanguage("en"); assert.equal(t("Open cart, {0} items", [2]), "Open cart, 2 items"); changeLanguage("ar"); const note = t("Note: Home"); assert.ok(note.includes("Home")); assert.ok(note.includes("ملاحظة")); assert.ok(!note.includes("الرئيسية")); } finally { changeLanguage("en"); }
});
test("staff surfaces have no customer locale and language provider never keys/remounts cart or forms",async()=>{
 for(const path of ["/admin","/pos","/kitchen/recipes","/rider/cash","/inventory"])assert.equal(isCustomerPath(path),false);for(const path of ["/","/menu","/profile/orders","/reset-password"])assert.equal(isCustomerPath(path),true);
 const provider=await readFile(new URL("../src/i18n/LocaleProvider.jsx",import.meta.url),"utf8");assert.doesNotMatch(provider,/key=\{language\}|location\.reload|clearCart|\.reset\(/);assert.match(provider,/localStorage\.setItem/);
});
