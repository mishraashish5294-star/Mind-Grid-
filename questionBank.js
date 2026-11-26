const { LEVELS, clampLevel } = require("./adaptive");

const CATEGORIES = ["arithmetic", "spatial", "sequence"];
const CATEGORY_LABELS = {
  arithmetic: "Mathematical Reasoning / Arithmetic",
  spatial: "Spatial Puzzles",
  sequence: "Sequence Puzzles"
};
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = xs => xs[rand(0, xs.length - 1)];
const gcd = (a,b) => b ? gcd(b, a % b) : Math.abs(a);
const choose = (n,k) => {
  if (k < 0 || k > n) return 0;
  let v = 1;
  for (let i=1;i<=k;i++) v = v * (n-i+1) / i;
  return Math.round(v);
};
const fmt = n => Number.isInteger(n) ? String(n) : Number(n.toFixed(3)).toString();

function make(prompt, answer, hint, explanation, topic, level, type) {
  const correct = String(answer);
  const distractors = new Set();
  const numeric = Number(answer);
  if (Number.isFinite(numeric)) {
    const offsets = [1, -1, 2, -2, 3, -3, 5, -5, 10, -10];
    for (const d of offsets) {
      const candidate = fmt(numeric + d);
      if (candidate !== correct) distractors.add(candidate);
      if (distractors.size === 3) break;
    }
  } else {
    for (const d of ["None of these", "0", "1", "2", "Not enough information"]) {
      if (d !== correct) distractors.add(d);
      if (distractors.size === 3) break;
    }
  }
  const choices = [correct, ...distractors].slice(0,4).sort(() => Math.random() - .5);
  return { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`, category: null,
    level, levelName: LEVELS[level-1], type, topic, prompt, choices, answer: correct, hint, explanation };
}

function arithmetic(level) {
  let q;
  if (level === 1) {
    const a=rand(12,60), b=rand(3,25), op=pick(["+","−","×"]);
    const ans=op==="+"?a+b:op==="−"?a-b:a*b;
    q=make(`${a} ${op} ${b} = ?`,ans,"पहले operation पहचानें और फिर क्रम से हल करें।",`${a} ${op} ${b} = ${ans}.`,"Arithmetic",level,"calculation");
  } else if (level === 2) {
    const a=rand(2,9), x=rand(2,12), b=rand(1,15), c=a*x+b;
    q=make(`${a}x + ${b} = ${c}. x का मान क्या है?`,x,`${b} को दूसरी तरफ ले जाकर ${a} से divide करें.`,`x = (${c} − ${b}) / ${a} = ${x}.`,"Algebra",level,"linear-equation");
  } else if (level === 3) {
    const a=rand(1,5), b=rand(1,5), c=rand(1,5), d=rand(1,5), det=a*d-b*c;
    q=make(`Matrix [[${a}, ${b}], [${c}, ${d}]] का determinant निकालें।`,det,"2×2 determinant = ad − bc.",`${a}×${d} − ${b}×${c} = ${det}.`,"Matrices & Determinants",level,"determinant");
  } else if (level === 4) {
    const m=pick([5,7,8,9,11,13]), a=rand(2,m-1), b=rand(1,m-1), ans=(a*b)%m;
    q=make(`यदि a = ${a}, b = ${b}, तो (a × b) mod ${m} का मान क्या है?`,ans,"पहले गुणा करें, फिर modulus से भाग देने पर remainder लें.",`${a}×${b} = ${a*b}; ${a*b} को ${m} से भाग देने पर remainder ${ans} है.`,"Number Theory & Modular Arithmetic",level,"modular-arithmetic");
  } else {
    const kind=pick(["prob","comb","derivative"]);
    if(kind==="prob"){
      const red=rand(2,5), blue=rand(2,5), total=red+blue;
      q=make(`एक bag में ${red} लाल और ${blue} नीली गेंदें हैं। बिना replacement दो गेंदें निकालने पर दोनों लाल होने की probability कितनी है?`,fmt((red/total)*((red-1)/(total-1))),"पहली लाल की probability × उसके बाद दूसरी लाल की conditional probability.",`P = (${red}/${total}) × (${red-1}/${total-1}) = ${fmt((red/total)*((red-1)/(total-1)))}.`,"Probability",level,"probability");
    } else if(kind==="comb"){
      const n=rand(6,10), k=rand(2,Math.min(4,n-2)), ans=choose(n,k);
      q=make(`${n} अलग वस्तुओं में से ${k} चुनने के कितने तरीके हैं?`,ans,"क्रम महत्वपूर्ण नहीं है: nCk = n! / (k!(n−k)!).",`${n}C${k} = ${ans}.`,"Combinatorics",level,"combinations");
    } else {
      const a=rand(2,7), b=rand(1,9), x=rand(2,8), ans=2*a*x+b;
      q=make(`f(x) = ${a}x² + ${b}x. f′(${x}) का मान क्या है?`,ans,"Power rule: d/dx(ax² + bx) = 2ax + b.",`f′(x) = ${2*a}x + ${b}; f′(${x}) = ${ans}.`,"Calculus: Differentiation",level,"derivative");
    }
  }
  q.category="arithmetic"; return q;
}

function spatial(level) {
  let q;
  if(level===1){
    const w=rand(3,12), h=rand(2,10), ans=w*h;
    q=make(`${w} × ${h} आयाम वाले rectangle का area कितना है?`,ans,"Area = length × width.",`${w} × ${h} = ${ans} square units.`,"2D Geometry",level,"area");
  } else if(level===2){
    const x=rand(-5,8), y=rand(-5,8), ans=`(${x}, ${-y})`;
    q=make(`Point (${x}, ${y}) को x-axis में reflect करने पर नया point क्या होगा?`,ans,"x-axis reflection में x वही रहता है और y का sign बदलता है.",`(x,y) → (x,−y), इसलिए नया point ${ans} है.`,"Coordinate Transformations",level,"reflection");
  } else if(level===3){
    const r=rand(2,6), h=rand(3,9), ans= Math.PI*r*r*h;
    q=make(`Radius ${r} और height ${h} वाले cylinder का volume (π के रूप में) कितना है?`,`${r*r*h}π`,"Cylinder volume = πr²h.",`V = π × ${r}² × ${h} = ${r*r*h}π cubic units.`,"3D Geometry",level,"volume");
  } else if(level===4){
    const x=rand(1,6), y=rand(1,6);
    q=make(`Point (${x}, ${y}) को origin के चारों ओर 90° anticlockwise rotate करें। नया point?`,`(${-y}, ${x})`,"90° anticlockwise: (x,y) → (−y,x).",`(${x},${y}) → (${-y},${x}).`,"Rotations & Coordinate Geometry",level,"rotation");
  } else {
    const a=rand(1,4), b=rand(1,4), c=rand(1,4);
    const det=a*b - 1;
    q=make(`2D linear transformation का matrix [[${a}, 1], [1, ${b}]] है। यह area को कितने factor से scale करता है?`,Math.abs(det),"Area scale factor = determinant का absolute value.",`det = ${a}×${b} − 1×1 = ${det}; area scale factor = |${det}| = ${Math.abs(det)}.`,"Linear Transformations & Determinants",level,"linear-transformation");
  }
  q.category="spatial"; return q;
}

function sequence(level) {
  let q;
  if(level===1){
    const a=rand(2,12), d=rand(2,8), ans=a+5*d;
    q=make(`${[0,1,2,3,4].map(i=>a+i*d).join(", ")}, ?`,ans,"लगातार terms के बीच का अंतर देखें.",`Common difference ${d}; अगला term = ${a+4*d} + ${d} = ${ans}.`,"Arithmetic Progression",level,"arithmetic-sequence");
  } else if(level===2){
    const a=rand(1,4), r=rand(2,3), ans=a*Math.pow(r,5);
    q=make(`${[0,1,2,3,4].map(i=>a*Math.pow(r,i)).join(", ")}, ?`,ans,"हर term को पिछले term से divide करके common ratio निकालें.",`Common ratio ${r}; अगला term = ${a} × ${r}⁵ = ${ans}.`,"Geometric Progression",level,"geometric-sequence");
  } else if(level===3){
    const a=rand(1,5), b=rand(2,6), seq=[a,b];
    while(seq.length<6) seq.push(seq.at(-1)+seq.at(-2));
    q=make(`${seq.slice(0,5).join(", ")}, ?`,seq[5],"हर नया term पिछले दो terms का योग है.",`Fibonacci-type recurrence: aₙ = aₙ₋₁ + aₙ₋₂; अगला term ${seq[5]} है.`,"Fibonacci & Recurrence Relations",level,"fibonacci");
  } else if(level===4){
    const a=rand(1,4), d=rand(1,3), terms=[0,1,2,3,4].map(n=>a*n*n+d);
    const ans=a*25+d;
    q=make(`${terms.join(", ")}, ?` ,ans,"पहले differences निकालें; second difference constant होगा.",`यह quadratic polynomial sequence है: aₙ = ${a}n² + ${d} (n = 0 से); अगला term ${ans}.`,"Polynomial Sequences",level,"polynomial");
  } else {
    const p=rand(2,4), qv=rand(1,3), a0=1, a1=2, seq=[a0,a1];
    for(let i=2;i<6;i++) seq.push(p*seq[i-1]+qv*seq[i-2]);
    q=make(`${seq.slice(0,5).join(", ")}, ?`,seq[5],"Recurrence को aₙ = p·aₙ₋₁ + q·aₙ₋₂ के रूप में पहचानें.",`aₙ = ${p}aₙ₋₁ + ${qv}aₙ₋₂; अगला term = ${p}×${seq[4]} + ${qv}×${seq[3]} = ${seq[5]}.`,"Linear Recurrence Relations",level,"recurrence");
  }
  q.category="sequence"; return q;
}

function generateQuestion(category, level=1) {
  if (!CATEGORIES.includes(category)) throw new Error("Unknown puzzle category.");
  const l=clampLevel(level);
  return category==="arithmetic" ? arithmetic(l) : category==="spatial" ? spatial(l) : sequence(l);
}
module.exports = { CATEGORIES, CATEGORY_LABELS, generateQuestion };
