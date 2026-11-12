import type {APIRoute} from 'astro';
import monsters from '../data/monsters.json';
import items from '../data/items.json';
import buffs from '../data/buffs.json';

// Keep this in sync with static routes. Do not index legacy redirects,
// filtered search URLs, or dynamically generated query variants.
const pages=['/','/resources/','/chests/','/calendar/','/loot-compass/','/troops/','/training/','/generals/','/about/','/privacy/','/contact/'];
const escapeXml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const slugify=(name:string)=>name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export const GET:APIRoute=({site})=>{
 const base=site||new URL('https://evonymasters.jaynmegepicadventure.workers.dev');
 const paths=new Set(pages);
 for(const monster of monsters)paths.add('/bosses/'+encodeURIComponent(monster.id)+'/');
 for(const item of items.filter(item=>/^lv\d+-boss-monster-chest$/.test(item.id)))
  paths.add('/items/'+encodeURIComponent(item.id)+'/');
 for(const row of buffs.filter(row=>row.type==='General' && row.name))
  paths.add('/generals/'+encodeURIComponent(slugify(row.name))+'/');
 const links=[...paths].sort().map(path=>'<url><loc>'+escapeXml(new URL(path,base).toString())+'</loc></url>').join('');
 return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+links+'</urlset>',{
  headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=3600'}
 });
};
