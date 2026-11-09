// March preset worksheet model, derived from the supplied "Troop Layers 2024.xlsx"
// March Layers sheet. Workbook has no T16 column, so T16 allocations are explicitly
// an extrapolation from the workbook's highest-tier (T15) share.
export const TYPES=["Ranged","Cavalry","Ground","Siege"];
export const PRESETS={
 ranged:{label:"Ranged",type:"Ranged",mode:"weighted",reserve:unlocked=>650000+10000*(hasTop(unlocked,"Cavalry")+hasTop(unlocked,"Ground")+hasTop(unlocked,"Siege")),withTop:[[15,15],[14,20],[13,30],[12,35]],withoutTop:[[14,20],[13,35],[12,45]],sample:7393200,source:"March Layers!D4:D16"},
 cavalry:{label:"Cavalry",type:"Cavalry",mode:"weighted",reserve:unlocked=>680000+10000*(hasTop(unlocked,"Ranged")+hasTop(unlocked,"Ground")+hasTop(unlocked,"Siege")),withTop:[[15,15],[14,20],[13,30],[12,35]],withoutTop:[[14,25],[13,35],[12,40]],sample:7480700,source:"March Layers!E4:E16"},
 ground:{label:"Ground",type:"Ground",mode:"weighted",reserve:unlocked=>605000+10000*(hasTop(unlocked,"Ranged")+hasTop(unlocked,"Cavalry")+hasTop(unlocked,"Siege"))+500000*hasTop(unlocked,"Ground"),withTop:[[15,40],[14,40],[13,20]],withoutTop:[[14,40],[13,40],[12,20]],sample:7486400,source:"March Layers!F4:F16"},
 bigSiege:{label:"Big Siege",type:"Siege",mode:"weighted",reserve:unlocked=>54000+1000*(hasTop(unlocked,"Ranged")+hasTop(unlocked,"Cavalry")+hasTop(unlocked,"Ground")),withTop:[[15,10],[14,25],[13,65]],withoutTop:[[14,25],[13,75]],sample:6013200,source:"March Layers!G4:G16"},
 smallSiege:{label:"Small Siege",type:"Siege",mode:"small",fixed:[[15,50000],[14,50000],[13,50000],[12,50000],[10,50000],[9,50000]],reserve:unlocked=>50000+1000*(hasTop(unlocked,"Ranged")+hasTop(unlocked,"Cavalry")+hasTop(unlocked,"Ground")),sample:5749450,source:"March Layers!H4:H16"},
 soloSiege:{label:"Solo Siege",type:"Siege",mode:"weighted",reserve:unlocked=>50000+1000*(hasTop(unlocked,"Ranged")+hasTop(unlocked,"Cavalry")+hasTop(unlocked,"Ground")),withTop:[[15,5],[14,10],[13,50],[12,35]],withoutTop:[[14,15],[13,50],[12,35]],sample:5549800,source:"March Layers!I4:I16"}
};
export const makeUnlocks=()=>Object.fromEntries(TYPES.map(type=>[type,{13:true,14:true,15:false,16:false}]));
export function hasTop(unlocked,type){return Number(!!(unlocked?.[type]?.[15]||unlocked?.[type]?.[16]));}
function available(unlocked,type,tier){return tier<=12||!!unlocked?.[type]?.[tier];}
function targetTier(unlocked,type,tier){
 if(tier<=12)return tier;
 for(let t=Math.min(16,tier);t>=12;t--)if(available(unlocked,type,t))return t;
 return 12;
}
function allocateByWeights(total,weights){
 const entries=[...weights].filter(([,n])=>n>0).sort((a,b)=>b[0]-a[0]);
 const sum=entries.reduce((v,[,weight])=>v+weight,0);
 if(!sum||!total)return [];
 const rows=entries.map(([tier,weight])=>({tier,count:Math.floor(total*weight/sum),fraction:total*weight%sum}));
 let remaining=total-rows.reduce((n,row)=>n+row.count,0);
 for(const row of [...rows].sort((a,b)=>b.fraction-a.fraction||b.tier-a.tier)){if(!remaining)break;row.count++;remaining--;}
 return rows.sort((a,b)=>b.tier-a.tier).filter(row=>row.count>0).map(({tier,count})=>({tier,count}));
}
export function calculatePreset({marchSize,preset="ranged",unlocked=makeUnlocks()},profiles=PRESETS){
 const profile=profiles[preset];if(!profile)throw new Error("Unknown march preset");
 const size=Number(marchSize);
 if(!Number.isSafeInteger(size)||size<1||size>100000000)throw new Error("Enter a march size between 1 and 100,000,000.");
 const warnings=[],top=hasTop(unlocked,profile.type),sourceReserve=profile.reserve(unlocked);
 // The sheet uses fixed-size support layers; for small marches there is no
 // source-grounded percentage rule. Leave a conservative 40% cap and flag it.
 const reserve=sourceReserve>size?Math.min(sourceReserve,Math.floor(size*.4)):sourceReserve;
 if(sourceReserve>size)warnings.push("Your march is smaller than the workbook's fixed layer allocation ("+sourceReserve.toLocaleString()+"). Support layers are reduced to 40% as a provisional fallback, not a workbook formula.");
 const budget=size-reserve;
 let allocations=[];
 if(profile.mode==="small"){
  // Small Siege workbook reserves 50K each for T14, T13, T12, T10 and T9
  // (and optionally T15), then assigns all remaining units to T11.
  const baseFixed=profile.fixed||[[15,50000],[14,50000],[13,50000],[12,50000],[10,50000],[9,50000]];
  const fixed=baseFixed.filter(([tier])=>tier!==15||top);
  const sumFixed=fixed.reduce((n,[,value])=>n+value,0);
  const chosen=sumFixed>budget?allocateByWeights(budget,fixed):fixed.map(([tier,count])=>({tier,count}));
  const map=new Map();
  for(const row of chosen){const tier=targetTier(unlocked,profile.type,row.tier);map.set(tier,(map.get(tier)||0)+row.count);}
  if(sumFixed>budget)warnings.push("March capacity is too small for all fixed 50,000 Small Siege tier allocations. Those values were proportionally reduced.");
  else map.set(11,(map.get(11)||0)+(budget-sumFixed));
  allocations=[...map].sort((a,b)=>b[0]-a[0]).map(([tier,count])=>({tier,count}));
 }else{
  const weights=top?profile.withTop:profile.withoutTop;
  const byTier=new Map();
  for(const [tier,weight] of weights){
   if(tier===15&&unlocked?.[profile.type]?.[16]){
    const split15=unlocked[profile.type][15]?40:0;
    byTier.set(16,(byTier.get(16)||0)+weight*(100-split15)/100);
    if(split15)byTier.set(15,(byTier.get(15)||0)+weight*split15/100);
   }else{
    const fallback=targetTier(unlocked,profile.type,tier);
    byTier.set(fallback,(byTier.get(fallback)||0)+weight);
   }
  }
  allocations=allocateByWeights(budget,[...byTier]);
 }
 if(unlocked?.[profile.type]?.[16])warnings.push("T16 is not in the 2024 workbook. Its main-tier share is extrapolated from T15"+(unlocked[profile.type][15]?" (60% to T16, 40% to T15).":"."));
 if(!unlocked?.[profile.type]?.[13]||!unlocked?.[profile.type]?.[14])warnings.push("A workbook tier is unavailable in your selection. Its share has been reassigned to the nearest lower available tier (T12 is assumed unlocked).");
 const combined=allocations.reduce((n,row)=>n+row.count,0);
 if(combined+reserve!==size)throw new Error("Preset allocation does not match march size");
 return {preset,label:profile.label,type:profile.type,marchSize:size,sourceReserve,reserve,mainTroops:combined,allocations,rows:[...allocations.map(row=>({type:profile.type,tier:row.tier,count:row.count})),{type:"All troop types",tier:null,count:reserve,label:"Supporting layers / lower tiers"}],warnings,source:profile.source,sourceSample:profile.sample,assumptions:["2024 workbook fixed support layers are aggregated because the workbook does not break every support-layer slot into individual troop counts.","Lower-tier support assumes T1–T12 are available. T13–T16 availability controls apply to the main troop allocation.","This is a workbook-derived template, not a guarantee of battle effectiveness."]};
}
