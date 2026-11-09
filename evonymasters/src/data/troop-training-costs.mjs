/**
 * Evony troop training costs for ONE troop.
 * Source: user-supplied "Troop_training_Guide.xlsx", sheet "Troop Training",
 * rows 5–68, columns B–I. Empty cells are represented as zero.
 *
 * Resource columns: food, wood, stone, ore. Power is gained, not a cost.
 * Gold is a separate cost and is not included in totalResources.
 */
export const RESOURCE_KEYS = ['food','wood','stone','ore','power','gold'];
export const TROOP_TYPES = ['Ground','Ranged','Cavalry','Siege'];
// [tier, power per troop, gold per troop, resource costs per troop in troop-type order]
const costs = [
 [16,230,1300,[[36600,0,12200,12200],[12200,36600,12200,0],[12200,12200,0,36600],[0,12200,36600,12200]]],
 [15,163,800,[[22500,0,7500,7500],[7500,22500,7500,0],[7500,7500,0,22500],[0,7500,22500,7500]]],
 [14,122,200,[[13500,0,4500,4500],[4500,13500,4500,0],[4500,4500,0,13500],[0,4500,13500,4500]]],
 [13,81,0,[[9000,0,3000,3000],[3000,9000,3000,0],[3000,3000,0,9000],[0,3000,9000,3000]]],
 [12,53.63,0,[[6000,0,2000,2000],[2000,6000,2000,0],[2000,2000,0,6000],[0,2000,6000,2000]]],
 [11,35.75,0,[[3900,0,1300,1300],[1300,3900,1300,0],[1300,1300,0,3900],[0,1300,3900,1300]]],
 [10,29.79,0,[[2500,0,850,850],[850,2500,850,0],[850,850,0,2500],[0,850,2250,850]]],
 [9,22.06,0,[[1800,0,600,600],[600,1800,600,0],[600,600,0,1800],[0,600,1800,600]]],
 [8,16.34,0,[[1300,0,420,420],[420,1300,420,0],[420,420,0,1300],[0,420,1300,420]]],
 [7,12.11,0,[[900,0,300,300],[300,900,300,0],[300,300,0,900],[0,300,900,300]]],
 [6,8.97,0,[[660,0,220,220],[220,660,220,0],[260,260,0,580],[0,220,660,220]]],
 [5,6.64,0,[[460,0,160,120],[160,420,160,0],[240,240,0,260],[0,160,420,160]]],
 [4,4.92,0,[[380,0,120,60],[120,320,120,0],[220,220,0,120],[0,120,320,120]]],
 [3,3.65,0,[[320,0,80,0],[80,240,80,0],[200,200,0,0],[0,120,280,120]]],
 [2,2.70,0,[[220,0,40,0],[60,160,40,0],[130,130,0,0],[0,120,140,0]]],
 [1,2,0,[[160,0,0,0],[40,120,0,0],[80,80,0,0],[0,100,60,0]]]
];
export const TROOP_TRAINING_COSTS = costs.flatMap(([tier,power,gold,rows]) =>
 rows.map((resources,index) => {
  const type=TROOP_TYPES[index];
  const [food,wood,stone,ore]=resources;
  return {id:`t${tier}-${type.toLowerCase()}`,tier,type,food,wood,stone,ore,power,gold};
 })
);
export function calculateTrainingRow(row,required){
 const qty=Number.isFinite(Number(required))?Math.max(0,Math.floor(Number(required))):0;
 const food=row.food*qty,wood=row.wood*qty,stone=row.stone*qty,ore=row.ore*qty;
 return {id:row.id,tier:row.tier,type:row.type,required:qty,food,wood,stone,ore,
   power:Math.round(row.power*qty*100)/100,gold:row.gold*qty,
   totalResources:food+wood+stone+ore};
}
export function calculateTrainingTotals(rows){
 const total={required:0,food:0,wood:0,stone:0,ore:0,power:0,gold:0,totalResources:0};
 for(const r of rows)for(const key of Object.keys(total))total[key]+=r[key]||0;
 total.power=Math.round(total.power*100)/100;
 return total;
}
