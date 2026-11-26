const fs = require("node:fs");
const path = require("node:path");

class JsonStore {
  constructor(dataDir) {
    this.file = path.join(dataDir || path.join(__dirname,"data"), "mindgrid.json");
    fs.mkdirSync(path.dirname(this.file), {recursive:true});
    if (!fs.existsSync(this.file)) fs.writeFileSync(this.file, JSON.stringify({sessions:{}, attempts:[], feedback:[]},null,2));
    this.data = this.read();
  }
  read(){ try{return JSON.parse(fs.readFileSync(this.file,"utf8"));}catch{return {sessions:{},attempts:[],feedback:[]};} }
  write(){ const tmp=this.file+".tmp"; fs.writeFileSync(tmp,JSON.stringify(this.data,null,2)); fs.renameSync(tmp,this.file); }
  async saveAttempt(a){
    const s=this.data.sessions[a.sessionId] ||= {createdAt:new Date().toISOString()};
    this.data.attempts.push(a);
    if(this.data.attempts.length>50000)this.data.attempts.splice(0,this.data.attempts.length-50000);
    s.lastActiveAt=a.createdAt; this.write(); return a;
  }
  async getAttempts(sessionId, category){
    return this.data.attempts.filter(a=>a.sessionId===sessionId && (!category||a.category===category));
  }
  async saveFeedback(f){this.data.feedback.push(f);this.write();}
  async summary(){
    const attempts=this.data.attempts;
    return {storage:"json-fallback",sessions:Object.keys(this.data.sessions).length,attempts:attempts.length,
      accuracy:attempts.length?attempts.filter(a=>a.correct).length/attempts.length:0,
      categories:Object.fromEntries(["arithmetic","spatial","sequence"].map(c=>[c,attempts.filter(a=>a.category===c).length])),
      feedbackCount:this.data.feedback.length};
  }
  async close(){}
}

class PostgresStore {
  constructor(pool){this.pool=pool;}
  async init(){
    await this.pool.query(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS attempts (id BIGSERIAL PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), category TEXT NOT NULL, level INTEGER NOT NULL, correct BOOLEAN NOT NULL, response_time_ms INTEGER NOT NULL, topic TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS attempts_session_category_idx ON attempts(session_id, category, created_at DESC)`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS feedback (id BIGSERIAL PRIMARY KEY, session_id TEXT NOT NULL, ease INTEGER NOT NULL, challenge INTEGER NOT NULL, comment TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  }
  async saveAttempt(a){
    await this.pool.query(`INSERT INTO sessions(id) VALUES($1) ON CONFLICT(id) DO UPDATE SET last_active_at=NOW()`,[a.sessionId]);
    await this.pool.query(`INSERT INTO attempts(session_id,category,level,correct,response_time_ms,topic,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [a.sessionId,a.category,a.level,a.correct,a.responseTimeMs,a.topic,a.createdAt]);
    return a;
  }
  async getAttempts(sessionId,category){
    const r=await this.pool.query(`SELECT session_id AS "sessionId", category, level, correct, response_time_ms AS "responseTimeMs", topic, created_at AS "createdAt" FROM attempts WHERE session_id=$1 AND ($2::text IS NULL OR category=$2) ORDER BY created_at`,[sessionId,category||null]);
    return r.rows;
  }
  async saveFeedback(f){
    await this.pool.query(`INSERT INTO feedback(session_id,ease,challenge,comment) VALUES($1,$2,$3,$4)`,[f.sessionId,f.ease,f.challenge,f.comment]);
  }
  async summary(){
    const [s,a,c,f]=await Promise.all([
      this.pool.query("SELECT COUNT(*)::int AS n FROM sessions"),
      this.pool.query("SELECT COUNT(*)::int AS n, COALESCE(AVG(correct::int),0)::float AS accuracy FROM attempts"),
      this.pool.query("SELECT category, COUNT(*)::int AS n FROM attempts GROUP BY category"),
      this.pool.query("SELECT COUNT(*)::int AS n FROM feedback")
    ]);
    return {storage:"postgresql",sessions:s.rows[0].n,attempts:a.rows[0].n,accuracy:a.rows[0].accuracy,
      categories:Object.fromEntries(["arithmetic","spatial","sequence"].map(k=>[k,0])),
      feedbackCount:f.rows[0].n,...Object.fromEntries(c.rows.map(x=>[x.category,x.n]))};
  }
  async close(){await this.pool.end();}
}
async function createStore({databaseUrl, dataDir}={}){
  if(databaseUrl){
    try{
      const {Pool}=require("pg"); const pool=new Pool({connectionString:databaseUrl,ssl:process.env.PGSSL==="true"?{rejectUnauthorized:false}:undefined});
      const store=new PostgresStore(pool); await store.init(); return store;
    }catch(err){ console.error("PostgreSQL connection failed; using JSON fallback:",err.message); }
  }
  return new JsonStore(dataDir);
}
module.exports={JsonStore,PostgresStore,createStore};
