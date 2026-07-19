// ponytail: reads assembled-graph.json directly, computes structural analysis
const fs = require('fs');
const g = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3];

const FILE_TYPES = new Set(['file','config','document','service','pipeline','table','schema','resource','endpoint']);
const fileNodes = g.nodes.filter(n => FILE_TYPES.has(n.type));
const fileIds = new Set(fileNodes.map(n => n.id));
const allEdges = g.edges.filter(e => fileIds.has(e.source) && fileIds.has(e.target));
const importEdges = allEdges.filter(e => e.type === 'imports');

// directory grouping
const paths = fileNodes.map(n => n.filePath || n.name);
const group = n => {
  const p = (n.filePath || n.name).replace(/\\/g,'/');
  const segs = p.split('/');
  if (segs.length === 1) return 'root';
  if (segs[0] === 'src') return segs.length > 2 ? 'src/' + segs[1] : 'src-root';
  return segs[0];
};
const directoryGroups = {};
const nodeGroup = {};
for (const n of fileNodes) { const gp = group(n); (directoryGroups[gp] ||= []).push(n.id); nodeGroup[n.id] = gp; }

const nodeTypeGroups = {};
for (const n of fileNodes) (nodeTypeGroups[n.type] ||= []).push(n.id);

// fan in/out
const fileFanIn = {}, fileFanOut = {};
for (const e of importEdges) { fileFanOut[e.source] = (fileFanOut[e.source]||0)+1; fileFanIn[e.target] = (fileFanIn[e.target]||0)+1; }

// inter-group imports
const inter = {};
for (const e of importEdges) {
  const a = nodeGroup[e.source], b = nodeGroup[e.target];
  if (a !== b) inter[a+'->'+b] = (inter[a+'->'+b]||0)+1;
}
const interGroupImports = Object.entries(inter).map(([k,count]) => { const [from,to]=k.split('->'); return {from,to,count}; }).sort((a,b)=>b.count-a.count);

// intra-group density
const intraGroupDensity = {};
for (const gp of Object.keys(directoryGroups)) {
  let internal=0,total=0;
  for (const e of importEdges) {
    const a=nodeGroup[e.source],b=nodeGroup[e.target];
    if (a===gp||b===gp){ total++; if(a===gp&&b===gp) internal++; }
  }
  intraGroupDensity[gp]={internalEdges:internal,totalEdges:total,density:total?+(internal/total).toFixed(2):0};
}

// cross-category edges
const cc = {};
const typeOf = Object.fromEntries(fileNodes.map(n=>[n.id,n.type]));
for (const e of allEdges) {
  const k = typeOf[e.source]+'->'+typeOf[e.target]+':'+e.type;
  cc[k]=(cc[k]||0)+1;
}
const crossCategoryEdges = Object.entries(cc).map(([k,count])=>{const [pair,edgeType]=k.split(':');const [fromType,toType]=pair.split('->');return {fromType,toType,edgeType,count};});

// dependency direction
const dir = {};
for (const {from,to,count} of interGroupImports) {
  const key=[from,to].sort().join('|');
  dir[key] ||= {};
  dir[key][from+'->'+to]=count;
}
const dependencyDirection = Object.values(dir).map(d=>{
  const ents=Object.entries(d).sort((a,b)=>b[1]-a[1]);
  const [from,to]=ents[0][0].split('->');
  return {dependent:from,dependsOn:to};
});

// pattern matches (simple)
const PAT={components:'ui',app:'api',lib:'service',core:'service',store:'state',types:'types',__tests__:'test',hooks:'hooks',scripts:'utility',supabase:'data',migrations:'data','design-system':'documentation',docs:'documentation',demo:'assets',public:'assets'};
const patternMatches={};
for (const gp of Object.keys(directoryGroups)) {
  const base=gp.replace('src/','');
  patternMatches[gp]=PAT[base]||'unknown';
}

const result = {
  scriptCompleted:true,
  directoryGroups, nodeTypeGroups, crossCategoryEdges, interGroupImports,
  intraGroupDensity, patternMatches, dependencyDirection,
  fileStats:{
    totalFileNodes:fileNodes.length,
    filesPerGroup:Object.fromEntries(Object.entries(directoryGroups).map(([k,v])=>[k,v.length])),
    nodeTypeCounts:Object.fromEntries(Object.entries(nodeTypeGroups).map(([k,v])=>[k,v.length]))
  },
  fileFanIn:Object.fromEntries(Object.entries(fileFanIn).sort((a,b)=>b[1]-a[1]).slice(0,20)),
  fileFanOut:Object.fromEntries(Object.entries(fileFanOut).sort((a,b)=>b[1]-a[1]).slice(0,20)),
  nodeList:fileNodes.map(n=>({id:n.id,type:n.type,filePath:n.filePath||n.name,tags:n.tags}))
};
fs.writeFileSync(out, JSON.stringify(result,null,1));
console.log('OK', fileNodes.length, 'file nodes,', Object.keys(directoryGroups).length, 'groups');
