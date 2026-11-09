// Reference: Troop Layers 2024.xlsx, first worksheet (10,000 normal / 1,000 siege support layers).
// The spreadsheet defines named formation presets, not one universal percentage split.
// Fractions are rounded by largest remainder so every march sums exactly.
export const FORMATIONS = {
  ranged: { label:'Ranged', support:510000, fixed:{11:50000,10:50000,9:50000}, high:[.15,.20,.30,.35], low:[.20,.35,.45] },
  mounted: { label:'Cavalry', support:500000, fixed:{11:100000,10:25000,9:25000,8:25000,7:25000}, high:[.15,.20,.30,.35], low:[.25,.35,.40] },
  ground: { label:'Ground', support:490000, fixed:{11:25000,10:25000,9:25000,8:25000,7:25000}, high:[.40,.40,.20], low:[.40,.40,.20], specialTier:12, specialAmount:500000 },
  bigSiege: { label:'BIG Siege', support:56000, fixed:{}, high:[.10,.25,.65], low:[.25,.75] },
  smallSiege: { label:'Small Siege', support:52000, fixed:{14:50000,13:50000,12:50000,10:50000,9:50000}, residualTier:11 },
  soloSiege: { label:'Solo Siege', support:52000, fixed:{}, high:[.05,.10,.50,.35], low:[.15,.50,.35] }
};
export const REFERENCE_EXAMPLES = {
  ranged:{size:7393200,tiers:[7,8,9,10,11,12,13,14,15],expected:{15:1009980,14:1346640,13:2019960,12:2356620,11:50000,10:50000,9:50000}},
  mounted:{size:7480700,tiers:[7,8,9,10,11,12,13,14],expected:{14:1695175,13:2373245,12:2712280,11:100000,10:25000,9:25000,8:25000,7:25000}},
  ground:{size:7500000,tiers:[7,8,9,10,11,12,13,14,15],expected:{15:2554000,14:2554000,13:1277000,12:500000,11:25000,10:25000,9:25000,8:25000,7:25000}},
  bigSiege:{size:6013200,tiers:[7,8,9,10,11,12,13,14],expected:{14:1489300,13:4467900}},
  smallSiege:{size:5749450,tiers:[7,8,9,10,11,12,13,14],expected:{14:50000,13:50000,12:50000,11:5447450,10:50000,9:50000}},
  soloSiege:{size:5549800,tiers:[7,8,9,10,11,12,13,14],expected:{14:824670,13:2748900,12:1924230}}
};
function apportion(count, tiers, weights, result) {
  if (!count || !tiers.length) return;
  const sum=weights.reduce((a,b)=>a+b,0);
  if (!sum){result.set(tiers[0],(result.get(tiers[0])||0)+count);return;}
  const parts=tiers.map((tier,i)=>({tier,raw:count*weights[i]/sum}));
  let left=count;
  for (const p of parts){p.amount=Math.floor(p.raw);left-=p.amount;}
  parts.sort((a,b)=>(b.raw-b.amount)-(a.raw-a.amount)||b.tier-a.tier);
  for(let i=0;i<left;i++)parts[i%parts.length].amount++;
  for(const p of parts)result.set(p.tier,(result.get(p.tier)||0)+p.amount);
}
export function calculateFormation(type, marchInput, selectedTiers){
 const cfg=FORMATIONS[type]; if(!cfg) throw Error('Unknown formation');
 const march=Number.isFinite(Number(marchInput))?Math.max(0,Math.min(1e10,Math.floor(Number(marchInput)))):0;
 const tiers=[...new Set(selectedTiers.map(Number).filter(n=>Number.isInteger(n)&&n>=3&&n<=16))].sort((a,b)=>b-a);
 const values=new Map();
 if(!march||!tiers.length)return {type,march,tiers,rows:[],support:0,fixedTotal:0,remaining:0,total:0};
 const add=(tier,count)=>{if(count>0)values.set(tier,(values.get(tier)||0)+count);};
 const highest=tiers[0];
 let support=Math.min(march,cfg.support);
 let budget=march-support;
 let fixedTotal=0;
 const extraFixed={...cfg.fixed};
 if(cfg.specialTier&&highest>=15&&tiers.includes(cfg.specialTier))extraFixed[cfg.specialTier]=cfg.specialAmount;
 // The 50k fixed rows in Small Siege are separate from the workbook's 52k support reserve.
 const entries=Object.entries(extraFixed).map(([tier,count])=>[Number(tier),count]).filter(([tier])=>tiers.includes(tier)).sort((a,b)=>b[0]-a[0]);
 const primaryPool=tiers.filter(t=>!entries.some(([fixedTier])=>fixedTier===t));
 for(const [tier,requested] of entries){const amount=Math.min(budget,requested);add(tier,amount);budget-=amount;fixedTotal+=amount;}
 const high=highest>=15, weights=high?cfg.high:cfg.low;
 if(cfg.residualTier){
  const target=primaryPool.includes(cfg.residualTier)?cfg.residualTier:(primaryPool[0]??tiers[0]);
  add(target,budget);
 }else{
  const chosen=primaryPool.slice(0,weights.length);
  // For a tier-limited player, redistribute main-formation ratios only across owned, non-fixed tiers.
  apportion(budget,chosen.length?chosen:[tiers[0]],weights.slice(0,chosen.length||1),values);
 }
 const rows=[...values.entries()].filter(([,count])=>count>0).sort((a,b)=>b[0]-a[0]).map(([tier,count])=>({tier,count}));
 const total=support+rows.reduce((s,r)=>s+r.count,0);
 return {type,march,tiers,rows,support,fixedTotal,remaining:Math.max(0,march-support-fixedTotal),total};
}

/**
 * Present the T7–T1 same-type layers shown by "Default Layer Size" in the
 * reference workbook. These layers are part of the existing cross-type
 * support reserve, not extra troops added to the march.
 *
 * Already-calculated named layers (for example Ground T7 at 25,000) take
 * priority over the default size, avoiding double counting.
 */
export function displayFormationLayers(result) {
 const cfg=FORMATIONS[result.type];
 if(!cfg) throw Error('Unknown formation');
 const base=['bigSiege','smallSiege','soloSiege'].includes(result.type)?1000:10000;
 const counts=new Map(result.rows.map(({tier,count})=>[tier,count]));
 let remainingSupport=result.support;
 for(let tier=7;tier>=1;tier--){
  if((counts.get(tier)||0)>0)continue;
  const amount=Math.min(base,remainingSupport);
  counts.set(tier,amount);
  remainingSupport-=amount;
 }
 const top=Math.max(7,...result.tiers);
 const rows=Array.from({length:top},(_,i)=>({tier:top-i,count:counts.get(top-i)||0}));
 const displayed=rows.reduce((sum,r)=>sum+r.count,0);
 if(displayed+remainingSupport!==result.total){
  throw Error('Displayed layers and support do not reconcile with march total');
 }
 return {rows,otherSupport:remainingSupport,displayed,total:result.total};
}
