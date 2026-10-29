import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {STATES,DEFAULT_ENV} from '../shared/states';
import type {County} from '../shared/schema';
const root='public/data';await mkdir(root,{recursive:true});
async function output(name:string,data:unknown){const text=JSON.stringify(data);await writeFile(`${root}/${name}.json`,text);await writeFile(`${root}/${name}.json.gz`,gzipSync(text));}
// Offline rebuild uses committed normalized source rows; refresh explicitly with --refresh.
const refresh=process.argv.includes('--refresh');
let raw:any[];
if(refresh){const url='https://raw.githubusercontent.com/stiles/presidential-elections/main/data/processed/presidential_county_results.json';const res=await fetch(url);if(!res.ok)throw Error('County source download failed');raw=await res.json();await output('returns-source',raw.filter(x=>['2016','2020','2024'].includes(String(x.year))));}
else{try{raw=JSON.parse(await readFile(`${root}/returns-source.json`,'utf8'));}catch{raw=JSON.parse(await readFile('work/raw/county-results.json','utf8'));await output('returns-source',raw.filter(x=>['2016','2020','2024'].includes(String(x.year))));}}
const topology=JSON.parse(await readFile('node_modules/us-atlas/counties-10m.json','utf8'));
const groups=new Map<string,any[]>();for(const row of raw){const id=String(row.fips).padStart(5,'0');const list=groups.get(id)||[];list.push(row);groups.set(id,list);}
const counties:County[]=[];
for(const geo of topology.objects.counties.geometries){const fips=String(geo.id).padStart(5,'0'),st=STATES.find(s=>s.fips===fips.slice(0,2));if(!st||st.abbr==='AK')continue;const rows=groups.get(fips)||[];const row=rows.find(r=>String(r.year)==='2024')||rows.find(r=>String(r.year)==='2020');if(!row||row.votes_all<=0)continue;const history=['2016','2020','2024'].map(year=>{const x=rows.find(r=>String(r.year)===year);return x&&x.votes_dem+x.votes_rep>0?x.votes_dem/(x.votes_dem+x.votes_rep):row.votes_dem/(row.votes_dem+row.votes_rep);});const dem=history[2]*.8+history[1]*.15+history[0]*.05;counties.push({fips,name:geo.properties.name,state:st.abbr,votes:Math.round(row.votes_all),dem,history,education:.3,urban:.5,young:.2,income:0,white:0,region:st.region,dataQuality:String(row.year)==='2024'?'2024 returns; demographic defaults':'2020 fallback; demographic defaults'});}
// Alaska election districts do not align to borough geometries. Retain one honest statewide aggregate.
counties.push({fips:'02000',name:'Alaska (statewide; no county allocation)',state:'AK',votes:340510,dem:140026/(140026+184458),history:[.38,.435,.4315],education:.3,urban:.5,young:.2,income:0,white:0,region:3,dataQuality:'2024 statewide aggregate; not borough returns'});
for(const s of STATES)if(!counties.some(c=>c.state===s.abbr))throw Error(`Missing ${s.abbr}`);
await output('counties',counties);await output('counties-10m',topology);await output('environment-fallback',DEFAULT_ENV);
await output('polling',{asOf:DEFAULT_ENV.timestamp,approval:null,genericBallot:null,note:'No automated polling source with verified reuse terms configured. Neutral user-editable values are not measurements.'});
await output('districts',[{id:'ME-1',dem:.595/(.595+.383),votes:435000},{id:'ME-2',dem:.443/(.443+.538),votes:396375},{id:'NE-1',dem:136153/(136153+177666),votes:320194},{id:'NE-2',dem:163541/(163541+148905),votes:318646},{id:'NE-3',dem:70301/(70301+238245),votes:313342}]);
console.log(`Built ${counties.length} county/statewide units, ${STATES.length} states, ${STATES.reduce((a,s)=>a+s.ev,0)} EV.`);
