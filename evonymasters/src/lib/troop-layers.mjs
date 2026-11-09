/**
 * Troop layer calculator derived from Troop Layers 2024.xlsx.
 *
 * Updated reserve rule:
 *   - T1 to T9: default layer size for each of the four troop types
 *   - T10 to the highest tier selected: defaults for the OTHER three types
 *   - For the selected type, fixed Excel layers override its default T1–T9
 *     layers; extra fixed levels above T9 are deducted before proportional split.
 *
 * Base troop layer sizes: ranged, mounted and ground = 10,000; siege = 1,000.
 * Six formations map to four underlying troop types (all siege variants are siege).
 */
export const DEFAULT_LAYERS = Object.freeze({ ranged:10000, mounted:10000, ground:10000, siege:1000 });
export const FORMATIONS = {
 ranged: { label:'Ranged', troopType:'ranged', fixed:{11:50000,10:50000,9:50000}, high:[.15,.20,.30,.35], low:[.20,.35,.45] },
 mounted: { label:'Cavalry', troopType:'mounted', fixed:{11:100000,10:25000,9:25000,8:25000,7:25000}, high:[.15,.20,.30,.35], low:[.25,.35,.40] },
 ground: { label:'Ground', troopType:'ground', fixed:{11:25000,10:25000,9:25000,8:25000,7:25000}, high:[.40,.40,.20], low:[.40,.40,.20], specialTier:12, specialAmount:500000 },
 bigSiege: { label:'BIG Siege', troopType:'siege', fixed:{}, high:[.10,.25,.65], low:[.25,.75] },
 smallSiege: { label:'Small Siege', troopType:'siege', fixed:{14:50000,13:50000,12:50000,10:50000,9:50000}, residualTier:11 },
 soloSiege: { label:'Solo Siege', troopType:'siege', fixed:{}, high:[.05,.10,.50,.35], low:[.15,.50,.35] }
};
export const REFERENCE_EXAMPLES = {
 ranged:{size:7393200,tiers:[7,8,9,10,11,12,13,14,15]},
 mounted:{size:7480700,tiers:[7,8,9,10,11,12,13,14]},
 ground:{size:7500000,tiers:[7,8,9,10,11,12,13,14,15]},
 bigSiege:{size:6013200,tiers:[7,8,9,10,11,12,13,14]},
 smallSiege:{size:5749450,tiers:[7,8,9,10,11,12,13,14]},
 soloSiege:{size:5549800,tiers:[7,8,9,10,11,12,13,14]}
};
function allocateWeighted(count,tiers,weights,counts){
 if(!count||!tiers.length)return;
 const divisor=weights.reduce((a,b)=>a+b,0);
 if(!divisor){counts.set(tiers[0],(counts.get(tiers[0])||0)+count);return;}
 const portions=tiers.map((tier,i)=>({tier,exact:count*weights[i]/divisor}));
 let unallocated=count;
 for(const part of portions){part.quantity=Math.floor(part.exact);unallocated-=part.quantity;}
 portions.sort((a,b)=>(b.exact-b.quantity)-(a.exact-a.quantity)||b.tier-a.tier);
 for(let i=0;i<unallocated;i++)portions[i%portions.length].quantity++;
 for(const part of portions)counts.set(part.tier,(counts.get(part.tier)||0)+part.quantity);
}
export function calculateFormation(type,marchInput,selectedTiers){
 const cfg=FORMATIONS[type];if(!cfg)throw Error('Unknown formation');
 const value=Number(String(marchInput).replace(/,/g,''));
 const march=Number.isFinite(value)?Math.max(0,Math.min(1e10,Math.floor(value))):0;
 const tiers=[...new Set(selectedTiers.map(Number).filter(n=>Number.isInteger(n)&&n>=3&&n<=16))].sort((a,b)=>b-a);
 const highest=tiers[0]||0;
 const result={type,march,tiers,rows:[],ownLayers:0,otherLayers:0,baseLayers:0,extraFixed:0,support:0,remaining:0,total:0,unallocated:0};
 if(!march||!highest)return result;
 const ownDefault=DEFAULT_LAYERS[cfg.troopType];
 const counts=new Map();
 const defaults=Object.entries(DEFAULT_LAYERS);
 const otherDefault=defaults.reduce((sum,[troop,size])=>sum+(troop===cfg.troopType?0:size),0);
 // Reserve all four types through T9. Above T9 reserve ONLY the other three types.
 const ownBase=9*ownDefault;
 const otherBase=9*otherDefault;
 const otherUpper=Math.max(0,highest-9)*otherDefault;
 result.ownLayers=ownBase;
 result.otherLayers=otherBase+otherUpper;
 result.baseLayers=ownBase+result.otherLayers;
 for(let tier=1;tier<=9;tier++)counts.set(tier,ownDefault);
 const fixed={...cfg.fixed};
 if(cfg.specialTier&&highest>=15&&tiers.includes(cfg.specialTier))fixed[cfg.specialTier]=cfg.specialAmount;
 // Fixed own-type layers from Excel, excluding unavailable tiers.
 const primaryFixed=new Set();
 for(const [level,amount] of Object.entries(fixed)){
  const tier=Number(level);
  if(tier>highest||tier>=10&&!tiers.includes(tier))continue;
  const base=tier<=9?ownDefault:0;
  const extra=Math.max(0,amount-base);
  result.extraFixed+=extra;
  counts.set(tier,Math.max(base,amount));
  primaryFixed.add(tier);
 }
 const reserve=result.baseLayers+result.extraFixed;
 // A march smaller than mandatory layers is marked insufficient rather than
 // inventing a top-tier allocation or exceeding the entered march size.
 if(march<reserve){
  result.unallocated=reserve-march;
  result.support=reserve;
  result.rows=[...counts.entries()].sort((a,b)=>b[0]-a[0]).map(([tier,count])=>({tier,count}));
  result.total=reserve;
  return result;
 }
 const remaining=march-reserve;
 result.remaining=remaining;
 const mainPool=tiers.filter(t=>t>=10&&!primaryFixed.has(t));
 if(cfg.residualTier){
  const target=mainPool.includes(cfg.residualTier)?cfg.residualTier:(mainPool[0]||null);
  if(target){counts.set(target,(counts.get(target)||0)+remaining);}
  else if(remaining){result.unallocated=remaining;}
 }else{
  const weights=highest>=15?cfg.high:cfg.low;
  const chosen=mainPool.slice(0,weights.length);
  if(chosen.length)allocateWeighted(remaining,chosen,weights.slice(0,chosen.length),counts);
  else if(remaining)result.unallocated=remaining;
 }
 result.support=reserve;
 result.rows=[...counts.entries()].sort((a,b)=>b[0]-a[0]).map(([tier,count])=>({tier,count}));
 result.total=result.otherLayers+result.rows.reduce((sum,row)=>sum+row.count,0);
 return result;
}
/** Rows to display and the precise cross-type deduction. */
export function displayFormationLayers(result){
 const top=Math.max(9,...result.tiers);
 const counts=new Map(result.rows.map(({tier,count})=>[tier,count]));
 const rows=Array.from({length:top},(_,i)=>({tier:top-i,count:counts.get(top-i)||0}));
 const displayed=rows.reduce((sum,row)=>sum+row.count,0);
 return {rows,otherSupport:result.otherLayers,displayed,total:result.total};
}
