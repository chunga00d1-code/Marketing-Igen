import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { UserModel } from "../model/user.model";

const API = "https://api.canva.com/rest/v1";
function cfg() {
  const id=String(process.env.CANVA_CLIENT_ID||"").trim(), secret=String(process.env.CANVA_CLIENT_SECRET||"").trim(), redirect=String(process.env.CANVA_REDIRECT_URI||"").trim(), key=String(process.env.CANVA_TOKEN_ENCRYPTION_KEY||"").trim();
  if(!id||!secret||!redirect||!key) throw new Error("Thiếu cấu hình Canva trong .env.");
  return {id,secret,redirect,key};
}
function crypt(v:string, decrypt=false) {
  const k=createHash("sha256").update(cfg().key).digest();
  if(!decrypt){const iv=randomBytes(12),c=createCipheriv("aes-256-gcm",k,iv),b=Buffer.concat([c.update(v),c.final()]);return iv.toString("base64url")+"."+c.getAuthTag().toString("base64url")+"."+b.toString("base64url");}
  const [iv,tag,b]=v.split("."); const c=createDecipheriv("aes-256-gcm",k,Buffer.from(iv,"base64url")); c.setAuthTag(Buffer.from(tag,"base64url")); return Buffer.concat([c.update(Buffer.from(b,"base64url")),c.final()]).toString();
}
async function exchange(body:URLSearchParams) {
  const c=cfg(), r=await fetch(API+"/oauth/token",{method:"POST",headers:{Authorization:"Basic "+Buffer.from(c.id+":"+c.secret).toString("base64"),"Content-Type":"application/x-www-form-urlencoded"},body});
  const d=await r.json().catch(()=>({})) as {access_token?:string;refresh_token?:string;expires_in?:number;message?:string};
  if(!r.ok||!d.access_token||!d.refresh_token) throw new Error(d.message||"Canva không thể cấp quyền.");
  return d;
}
export const canvaService={
 async start(userId:string){
  const state=randomBytes(32).toString("base64url"), verifier=randomBytes(64).toString("base64url"),c=cfg();
  await UserModel.updateOne({_id:userId},{$set:{"canvaIntegration.oauthState":state,"canvaIntegration.oauthCodeVerifier":crypt(verifier),"canvaIntegration.oauthStateExpiresAt":new Date(Date.now()+600000)}});
  const q=new URLSearchParams({client_id:c.id,response_type:"code",redirect_uri:c.redirect,code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"s256",scope:"design:meta:read design:content:read",state});
  return "https://www.canva.com/api/oauth/authorize?"+q;
 },
 async callback(code:string,state:string){
  const u=await UserModel.findOne({"canvaIntegration.oauthState":state,"canvaIntegration.oauthStateExpiresAt":{$gt:new Date()}});
  if(!u?.canvaIntegration?.oauthCodeVerifier) throw new Error("Phiên Canva hết hạn, hãy thử lại.");
  const d=await exchange(new URLSearchParams({grant_type:"authorization_code",code,code_verifier:crypt(u.canvaIntegration.oauthCodeVerifier,true),redirect_uri:cfg().redirect}));
  await UserModel.updateOne({_id:u._id},{$set:{"canvaIntegration.connected":true,"canvaIntegration.accessToken":crypt(d.access_token),"canvaIntegration.refreshToken":crypt(d.refresh_token),"canvaIntegration.tokenExpiresAt":new Date(Date.now()+(d.expires_in||14400)*1000),"canvaIntegration.connectedAt":new Date()},$unset:{"canvaIntegration.oauthState":1,"canvaIntegration.oauthCodeVerifier":1,"canvaIntegration.oauthStateExpiresAt":1}});
 },
 async designs(userId:string){
  const u=await UserModel.findById(userId).select("canvaIntegration"); const i=u?.canvaIntegration;
  if(!i?.connected||!i.accessToken) throw new Error("Bạn chưa kết nối Canva.");
  const r=await fetch(API+"/designs?limit=30&sort_by=modified_descending",{headers:{Authorization:"Bearer "+crypt(i.accessToken,true)}}),d=await r.json().catch(()=>({})) as {items?:unknown[];message?:string};
  if(!r.ok) throw new Error(d.message||"Không thể tải mẫu Canva.");
  return d.items||[];
 }
};
