import { Router } from "express";
import { canvaService } from "../service/canva.service";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
export const canvaRouter=Router();
canvaRouter.get("/callback",async(req,res)=>{try{await canvaService.callback(String(req.query.code||""),String(req.query.state||""));res.type("html").send("<script>window.opener&&window.opener.postMessage({type:'igen-canva-connected'},'*');window.close()</script>Đã kết nối Canva. Bạn có thể đóng cửa sổ này.");}catch(e){res.status(400).send(e instanceof Error?e.message:"Canva lỗi");}});
canvaRouter.use(requireAuth);
canvaRouter.post("/oauth/start",async(req:AuthenticatedRequest,res)=>{try{res.json({status:"success",data:{url:await canvaService.start(req.user!.id)}})}catch(e){res.status(400).json({status:"error",message:e instanceof Error?e.message:String(e)})}});
canvaRouter.get("/designs",async(req:AuthenticatedRequest,res)=>{try{res.json({status:"success",data:await canvaService.designs(req.user!.id)})}catch(e){res.status(400).json({status:"error",message:e instanceof Error?e.message:String(e)})}});
