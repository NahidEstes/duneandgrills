import { test, mock } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Order from "../models/Order.js";
import RestaurantSettings from "../models/RestaurantSettings.js";
import CustomerEmailJob from "../models/CustomerEmailJob.js";
import { requestAccountEmail, resetCustomerPassword, verifyCustomerEmail } from "../controllers/customerAccountController.js";
import { accountEmailConfiguration, accountJobToken, queueAccountEmail, tokenHash, processAccountEmails, sendAccountEmail } from "../services/customerAccountEmailService.js";
import { createCustomerOrder } from "../services/customerOrderService.js";
import { register } from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
const response = () => ({ statusCode: 200, headers: {}, body: null, cleared: [], set(k,v) { this.headers[k]=v; return this; }, status(n) { this.statusCode=n;return this; }, json(value) { this.body=value;return this; }, clearCookie(name) { this.cleared.push(name);return this; } });
const query = value => ({ select() { return this; }, lean: async () => value, then: (resolve,reject) => Promise.resolve(value).then(resolve,reject) });
const environment = { NODE_ENV: "test", CUSTOMER_EMAIL_PROVIDER: "resend", RESEND_API_KEY: "not-a-real-provider-key", CUSTOMER_EMAIL_FROM: "Dune <account@example.test>", CUSTOMER_WEB_ORIGIN: "http://127.0.0.1:39001", CUSTOMER_EMAIL_TOKEN_SECRET: "test-token-secret-32-characters-minimum", CUSTOMER_EMAIL_WORKER_SECRET: "test-worker-secret-32-characters-minimum" };
test("customer account capabilities: hashed, one-time, expiring, scoped, revocable and privately queued", async t => {
  const original = Object.fromEntries(Object.keys(environment).map(key=>[key,process.env[key]])); Object.assign(process.env,environment);
  try {
    await t.test("configuration fails closed, links use only configured origins and 256-bit tokens", () => {
      assert.equal(accountEmailConfiguration().configured,true); assert.equal(accountEmailConfiguration({...environment,CUSTOMER_WEB_ORIGIN:"https://attacker.test/path"}).configured,false);
      assert.equal(accountEmailConfiguration({...environment,NODE_ENV:"production",CUSTOMER_WEB_ORIGIN:"http://example.test"}).configured,false);
      const token=accountJobToken({_id:"job",kind:"reset",user:"user",emailHash:"email"}); assert.match(token,/^[a-f0-9]{64}$/); assert.notEqual(tokenHash(token),token);
      assert.notEqual(token,accountJobToken({_id:"job",kind:"verify",user:"user",emailHash:"email"}));
    });
    await t.test("legacy verification defaults stay optional; public signup ignores staff and verification claims", async () => {
      assert.equal(User.schema.path("emailVerificationRequired").defaultValue, false);
      const key = process.env.RESEND_API_KEY, signingKey = process.env.JWT_SECRET;
      delete process.env.RESEND_API_KEY; process.env.JWT_SECRET = "owned-account-registration-fixture";
      let created;
      mock.method(User, "findOne", () => query(null));
      mock.method(User, "create", async fields => { created = fields; return { ...fields, _id: "111111111111111111111111" }; });
      const res = response(); res.cookie = () => res;
      try {
        await register({ body: { name: "Owned customer", email: "New@Example.Test", password: "CustomerPass123!", role: "admin", emailVerificationRequired: false, emailVerifiedAt: new Date() } }, res);
        assert.equal(res.statusCode, 201); assert.equal(created.role, "customer"); assert.equal(created.email, "new@example.test");
        assert.equal(created.emailVerificationRequired, true); assert.equal(created.emailVerifiedAt, null); assert.equal(res.body.emailDelivery, "unavailable");
        assert.equal(res.body.user.password, undefined); assert.equal(res.body.user.sessionVersion, undefined);
      } finally { mock.restoreAll(); process.env.RESEND_API_KEY = key; if (signingKey === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = signingKey; }
    });
    await t.test("the existing auth middleware rejects every JWT with the pre-reset session revision", async () => {
      const signingKey = process.env.JWT_SECRET; process.env.JWT_SECRET = "owned-session-revocation-fixture";
      mock.method(User, "findById", () => query({ _id: "customer", role: "customer", isActive: true, sessionVersion: 4 }));
      try {
        for (const revision of [undefined, 3, 4]) {
          const bearer = jwt.sign({ id: "customer", ...(revision === undefined ? {} : { sv: revision }) }, process.env.JWT_SECRET), res = response(); let allowed = false;
          await protect({ headers: { authorization: `Bearer ${bearer}` } }, res, () => { allowed = true; });
          assert.equal(allowed, revision === 4); assert.equal(res.statusCode, revision === 4 ? 200 : 401);
        }
      } finally { mock.restoreAll(); if (signingKey === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = signingKey; }
    });
    await t.test("single-use atomic reset rejects staff/expired/reused links, hashes password and revokes sessions", async () => {
      let stored={role:"customer",isActive:true,passwordResetTokenHash:tokenHash("a".repeat(64)),passwordResetExpiresAt:new Date(Date.now()+60_000),sessionVersion:3}, update;
      mock.method(User,"findOneAndUpdate",(filter,change)=>{ update=change; const match=stored&&stored.role===filter.role&&stored.passwordResetTokenHash===filter.passwordResetTokenHash&&stored.passwordResetExpiresAt>filter.passwordResetExpiresAt.$gt; if(!match)return query(null);stored.password=change.$set.password;stored.sessionVersion++;delete stored.passwordResetTokenHash;return query({_id:"customer"}); });
      const request={body:{token:"a".repeat(64),password:"NewPassword123!",confirmPassword:"NewPassword123!"}};
      const a=response(),b=response();await Promise.all([resetCustomerPassword(request,a),resetCustomerPassword(request,b)]);
      assert.deepEqual([a.statusCode,b.statusCode].sort(),[200,400]); assert.equal(stored.sessionVersion,4);assert.ok(await bcrypt.compare(request.body.password,stored.password));assert.notEqual(stored.password,request.body.password);assert.equal(update.$inc.sessionVersion,1); assert.ok(update.$unset.passwordResetRequestId);
      for(const patch of [{role:"manager"},{passwordResetExpiresAt:new Date(0)}]){stored={role:"customer",passwordResetTokenHash:tokenHash(request.body.token),passwordResetExpiresAt:new Date(Date.now()+60_000),...patch};const res=response();await resetCustomerPassword(request,res);assert.equal(res.statusCode,400);assert.equal(res.body.code,"ACCOUNT_LINK_INVALID");}
      mock.restoreAll();
    });
    await t.test("new unverified account orders are blocked while legacy, guests and idempotent recovery retain access", async () => {
      const request = { payload: { orderType: "pickup", items: [] }, actor: { _id: "customer", role: "customer", emailVerificationRequired: true } };
      await assert.rejects(createCustomerOrder(request), error => error.status === 403 && /Verify your email/.test(error.message));
      const reachedSettings = new Error("owned settings boundary");
      mock.method(RestaurantSettings, "findOne", () => ({ lean: async () => { throw reachedSettings; } }));
      try {
        for (const actor of [undefined, { role: "customer" }, { role: "customer", emailVerificationRequired: false }, { role: "customer", emailVerificationRequired: true, emailVerifiedAt: new Date() }]) await assert.rejects(createCustomerOrder({ ...request, actor }), error => error === reachedSettings);
        const signingKey = process.env.JWT_SECRET; process.env.JWT_SECRET = "owned-order-recovery-fixture";
        const existing = { user: "customer", source: "website", status: "pending" };
        mock.method(Order, "findOne", () => ({ select() { return this; }, session: async () => existing }));
        try { const result = await createCustomerOrder({ ...request, key: "owned-recovery" }); assert.equal(result.duplicate, true); assert.equal(result.order, existing); }
        finally { if (signingKey === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = signingKey; }
      } finally { mock.restoreAll(); }
    });
    await t.test("provider refusal or a missing provider message ID never counts as email acceptance", async () => {
      for (const response of [{ ok: false }, { ok: true, json: async () => ({}) }]) await assert.rejects(sendAccountEmail({ text: "owned fixture" }, "owned/job", { fetcher: async () => response }), { code: "EMAIL_PROVIDER_UNAVAILABLE" });
      await sendAccountEmail({ text: "owned fixture" }, "owned/job", { fetcher: async (_url, options) => { assert.equal(options.headers["Idempotency-Key"], "owned/job"); return { ok: true, json: async () => ({ id: "owned-provider-receipt" }) }; } });
    });
    await t.test("verification consumes its own exact capability once; never grants staff privileges",async()=>{
      let used=false; mock.method(User,"findOneAndUpdate",(filter,update)=>{assert.equal(filter.role,"customer");assert.equal(filter.emailVerificationTokenHash,tokenHash("b".repeat(64)));assert.ok(filter.emailVerificationExpiresAt.$gt instanceof Date);assert.equal(update.$set.emailVerificationRequired,false);assert.equal(update.$set.role,undefined);assert.equal(update.$unset.emailVerificationRequestId,1);const result=used?null:{_id:"customer"};used=true;return query(result);});
      const a=response(),b=response();await verifyCustomerEmail({body:{token:"b".repeat(64)}},a);await verifyCustomerEmail({body:{token:"b".repeat(64)}},b);assert.equal(a.statusCode,200);assert.equal(b.body.code,"ACCOUNT_LINK_INVALID");mock.restoreAll();
    });
    await t.test("existing/nonexistent/staff requests share acknowledgements, store only hashes and do not send from requests",async()=>{
      let found=null;const jobs=[],writes=[];mock.method(User,"findOne",filter=>{assert.equal(filter.role,"customer");return query(found);});mock.method(User,"updateOne",async(filter,update)=>{assert.equal(filter.role,"customer");writes.push(update);return {matchedCount:found?1:0};});mock.method(CustomerEmailJob.prototype,"save",async function(){jobs.push(this.toObject());return this;});
      const absent=await queueAccountEmail("absent@example.test","reset");found={_id:"111111111111111111111111",email:"present@example.test"};const present=await queueAccountEmail(found.email,"reset","ar");assert.deepEqual(present,absent);assert.equal(jobs[0].user,null);assert.equal(jobs[1].language,"ar");const token=accountJobToken(jobs[1]);assert.equal(writes[1].$set.passwordResetTokenHash,tokenHash(token));assert.ok(!JSON.stringify(jobs[1]).includes(token));assert.ok(!JSON.stringify(present).includes("example.test"));mock.restoreAll();
    });
    await t.test("missing email configuration is an explicit global failure, not a false sent message",async()=>{
      const key=process.env.RESEND_API_KEY;delete process.env.RESEND_API_KEY;try{for(const email of ["present@example.test","absent@example.test"]){const res=response();await requestAccountEmail("reset")({body:{email}},res);assert.equal(res.statusCode,503);assert.equal(res.body.code,"ACCOUNT_EMAIL_UNAVAILABLE");assert.doesNotMatch(res.body.message,/sent/i);}}finally{process.env.RESEND_API_KEY=key;}
    });
    await t.test("worker sends reproducible private links, only records provider acceptance after success, retries safely",async()=>{
      const job=new CustomerEmailJob({user:"111111111111111111111111",kind:"verify",emailHash:tokenHash("customer@example.test"),language:"ar",expiresAt:new Date(Date.now()+60_000)});let available=true,delivered=[],fail=true;
      mock.method(CustomerEmailJob,"findOneAndUpdate",()=>{if(!available)return Promise.resolve(null);available=false;job.attempts++;return Promise.resolve(job);});mock.method(User,"findOne",filter=>{assert.equal(filter.role,"customer");assert.equal(filter.emailVerificationTokenHash,tokenHash(accountJobToken(job)));return query({email:"customer@example.test"});});mock.method(CustomerEmailJob.prototype,"save",async function(){return this;});
      const deliver=async(message,key)=>{delivered.push({message,key});if(fail)throw new Error("provider timeout");};let result=await processAccountEmails({deliver,limit:1});assert.equal(result.retry,1);assert.equal(job.status,"retry");assert.equal(job.acceptedAt,null);fail=false;available=true;result=await processAccountEmails({deliver,limit:1});assert.equal(result.accepted,1);assert.equal(job.status,"accepted");assert.ok(job.acceptedAt);assert.deepEqual(delivered[0],delivered[1]);assert.match(delivered[1].message.text,/http:\/\/127\.0\.0\.1:39001\/verify-email#token=/);mock.restoreAll();
    });
  } finally { mock.restoreAll(); for(const [key,value]of Object.entries(original)){if(value===undefined)delete process.env[key];else process.env[key]=value;} }
});
