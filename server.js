const express = require("express");
const path = require("node:path");
const crypto = require("node:crypto");
const { CATEGORIES, CATEGORY_LABELS, generateQuestion } = require("./questionBank");
const { LEVELS, clampLevel, recommendDifficulty } = require("./adaptive");
const { createStore } = require("./storage");

function validSession(id){return typeof id==="string" && /^[a-zA-Z0-9_-]{8,100}$/.test(id);}
function createApp(store){
  const app=express();
  app.disable("x-powered-by");
  app.use(express.json({limit:"16kb"}));
  app.use(express.static(path.join(__dirname,"public")));
  app.get("/api/health",(_req,res)=>res.json({ok:true,service:"MindGrid API",levels:LEVELS}));
  app.get("/api/meta",(_req,res)=>res.json({categories:CATEGORY_LABELS,levels:LEVELS}));
  app.get("/api/question", (req,res)=>{
    const {category,level}=req.query;
    if(!CATEGORIES.includes(category))return res.status(400).json({error:"Valid category is required."});
    const q=generateQuestion(category,clampLevel(level));
    res.json(q);
  });
  app.post("/api/attempt",async(req,res,next)=>{
    try{
      const {sessionId,category,level,correct,responseTimeMs,topic}=req.body||{};
      if(!validSession(sessionId)||!CATEGORIES.includes(category)||!Number.isInteger(level)||level<1||level>5||
        typeof correct!=="boolean"||!Number.isInteger(responseTimeMs)||responseTimeMs<0||responseTimeMs>3600000)
        return res.status(400).json({error:"Invalid attempt payload."});
      const attempt={sessionId,category,level,correct,responseTimeMs,topic:String(topic||"").slice(0,100),createdAt:new Date().toISOString()};
      await store.saveAttempt(attempt);
      const history=await store.getAttempts(sessionId,category);
      const adaptive=recommendDifficulty(history,level);
      res.status(201).json({ok:true,adaptive,attempts:history.length});
    }catch(e){next(e);}
  });
  app.get("/api/profile/:sessionId",async(req,res,next)=>{
    try{
      if(!validSession(req.params.sessionId))return res.status(400).json({error:"Invalid session ID."});
      const categories={};
      for(const c of CATEGORIES){
        const a=await store.getAttempts(req.params.sessionId,c);
        const n=a.length, correct=a.filter(x=>x.correct).length;
        const times=a.map(x=>x.responseTimeMs).sort((x,y)=>x-y);
        categories[c]={attempts:n,correct,accuracy:n?correct/n:0,medianResponseTimeMs:times.length?times[Math.floor(times.length/2)]:null,
          recommendedLevel:recommendDifficulty(a,n?a[n-1].level:1).level};
      }
      const all=await store.getAttempts(req.params.sessionId);
      res.json({attempts:all.length,correct:all.filter(a=>a.correct).length,categories});
    }catch(e){next(e);}
  });
  app.post("/api/feedback",async(req,res,next)=>{
    try{
      const {sessionId,ease,challenge,comment=""}=req.body||{};
      if(!validSession(sessionId)||!Number.isInteger(ease)||ease<1||ease>5||!Number.isInteger(challenge)||challenge<1||challenge>5||typeof comment!=="string"||comment.length>500)
        return res.status(400).json({error:"Invalid feedback payload."});
      await store.saveFeedback({sessionId,ease,challenge,comment:comment.trim(),createdAt:new Date().toISOString()});
      res.status(201).json({ok:true});
    }catch(e){next(e);}
  });
  app.get("/api/summary",async(_req,res,next)=>{try{res.json(await store.summary());}catch(e){next(e);}});
  app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:"Internal server error. Please try again."});});
  return app;
}
async function start(){
  const store=await createStore({databaseUrl:process.env.DATABASE_URL,dataDir:process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):undefined});
  const app=createApp(store),port=Number(process.env.PORT)||3000;
  const server=app.listen(port,()=>console.log(`MindGrid is running at http://localhost:${port} (${process.env.DATABASE_URL?"PostgreSQL if connected":"local JSON fallback"})`));
  const shutdown=()=>server.close(async()=>{await store.close();process.exit(0);});
  process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
}
if(require.main===module)start().catch(e=>{console.error(e);process.exit(1);});
module.exports={createApp,validSession};
