'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
class BaseClass {}
BaseClass.extend = function(properties) {
 class Module extends this {}
 Object.assign(Module.prototype, properties);
 return Module;
};
const Parser = new Function('L', fs.readFileSync('htdocs/luci-static/resources/dn42/status.js', 'utf8'))({Class:BaseClass});
assert.equal(typeof Parser, 'function', 'LuCI modules must return a constructor');
assert(Parser.prototype instanceof BaseClass, 'LuCI modules must extend the base class');
const parse = new Parser();
const bgp = `BIRD 2.18.2 ready.
Name       Proto      Table      State  Since         Info
direct1    Direct     ---        up     2026-10-14
other      BGP        ---        start  00:40:00.000  Active Socket: Connection refused
dn42_tdmhome BGP      ---        up     00:46:21.219  Established
  BGP state:          Established
    Neighbor address: fe80::1%tdmhome
    Neighbor AS:      4242421044
    Local AS:         4242421044
    Neighbor ID:      172.20.145.1
  Channel ipv4
    State:            UP
    Table:            master4
    Routes:           612 imported, 2 exported, 600 preferred
    BGP Next hop:     fe80::2
  Channel ipv6
    State:            UP
    Table:            master6
    Routes:           400 imported, 2 exported, 390 preferred
`;
const rows = parse.protocols(bgp);
assert.equal(rows.length, 2);
assert.equal(rows[0].info, 'Active Socket: Connection refused');
assert.equal(rows[1].info, 'Established');
const b = parse.bgp(bgp);
assert.deepEqual(b.fields[0], ['BGP state', 'Established']);
assert.equal(b.channels.length, 2);
assert.equal(b.channels[0].name, 'ipv4');
assert.deepEqual(b.channels[1].fields[2], ['Routes', '400 imported, 2 exported, 390 preferred']);
const wg = parse.wireguard(`interface: tdmhome
  public key: local=
  private key: (hidden)
  listening port: 36502
peer: remote=
  preshared key: (hidden)
  endpoint: [2001:db8::1]:11452
  allowed ips: 172.20.0.0/14, fd00::/8
  latest handshake: 22 seconds ago
  transfer: 1.01 MiB received, 91.07 KiB sent
  persistent keepalive: every 25 seconds
peer: second=
  allowed ips: 192.0.2.0/24
`);
assert.equal(wg.iface, 'tdmhome');
assert.equal(wg.public_key, 'local=');
assert.equal(wg.peers.length, 2);
assert.equal(wg.peers[0].endpoint, '[2001:db8::1]:11452');
assert.equal(wg.peers[0].latest_handshake, '22 seconds ago');
assert.equal(wg.peers[1].latest_handshake, undefined);
assert.equal(JSON.stringify(wg).includes('private_key'), false);
assert.equal(parse.wireguard('Unable to access interface: No such device').iface, null);
assert.deepEqual(parse.protocols('birdc: Unable to connect to server'), []);
assert.deepEqual(parse.bgp('').channels, []);
assert.deepEqual(parse.routes('default via 192.0.2.1 dev wg0 table 100 metric 20')[0],{prefix:'default',gateway:'192.0.2.1',table:'100',metric:'20',type:'unicast'});
assert.equal(parse.routes('local 172.20.145.2 dev wg0 table local proto kernel')[0].type,'local');
assert.equal(parse.routes('fd00::/48 dev wg0 proto bird metric 32')[0].gateway,'直连');
assert.deepEqual(parse.routes(''),[]);
console.log('Status parser checks passed');

// Render with LuCI API stubs to check list navigation and structured details.
(async function(){
 const E = (tag, attrs, children) => ({tag,tagName:tag.toUpperCase(), attrs:attrs||{}, children:children||[]});
 const flatten = node => node == null ? '' : Array.isArray(node) ? node.map(flatten).join(' ') : typeof node === 'object' ? flatten(node.children) : String(node);
 const find = (node, predicate) => {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of Array.isArray(node) ? node : [node.children]) {
   const hit = find(child, predicate); if(hit)return hit;
  }
  return null;
 };
 const window = {location:{hash:''},addEventListener(){},removeEventListener(){}};
 let routeCalls=0;
 const rpc = {declare: ({method}) => async () => {
  if(method === 'interface_routes'){routeCalls++;return {ok:true,ipv4:'192.168.2.0/24 via 192.168.31.1 dev tdmhome proto bird metric 32',ipv6:'fd06:b4d2:9753:1::/64 via fe80::1 dev tdmhome metric 32'};}
  if(method === 'status')return {protocols:bgp,peers:[{name:'tdmhome',label:'Home',asn:'4242421044',iface:'tdmhome',kind:'ibgp',ipv4:'1',ipv6:'1',zone:'vpn',wg:'interface: tdmhome'}],roa:'尚无更新记录'};
  if(method === 'detail')return {bgp:bgp.split('other      BGP        ---        start  00:40:00.000  Active Socket: Connection refused\n').join(''),wg:'interface: tdmhome\n  listening port: 36502\npeer: remote=\n  endpoint: [2001:db8::1]:11452\n'};
  return {ok:true};
 }};
 let pollRegistrations=0;
 const page = new Function('view','rpc','poll','ui','dom','parse','E','window','L',fs.readFileSync('htdocs/luci-static/resources/view/dn42/status.js','utf8'))(
  {extend:x=>x},rpc,{add:()=>{pollRegistrations++;}},{},{content:(node, children)=>{node.children=children;}},parse,E,window,{resource:path=>'/luci-static/resources/'+path});
 const root = page.render();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(pollRegistrations,0);
 const refresh=()=>find(root,n=>n.tag==='button'&&n.children==='刷新状态').attrs.click();
 await refresh();
 assert(flatten(root).includes('Established'));
 const link = find(root,n=>n.tag === 'a' && n.attrs.href === '#connection=tdmhome');
 assert(link);
 link.attrs.click({preventDefault(){}});
 await refresh();
 assert.equal(window.location.hash,'connection=tdmhome');
 assert(flatten(root).includes('远端 ASN'));
 assert(flatten(root).includes('612 imported, 2 exported, 600 preferred'));
 assert(flatten(root).includes('[2001:db8::1]:11452'));
 assert(flatten(root).includes('返回连接列表'));
 assert(flatten(root).includes('vpn'));
 assert(flatten(root).includes('iBGP'));
 assert(!flatten(root).includes('每 10 秒'));
 assert.equal(routeCalls,0);
 await find(root,n=>n.tag==='button'&&n.children==='查询接口路由').attrs.click();
 assert.equal(routeCalls,1);
 assert(flatten(root).includes('192.168.2.0/24'));
 assert(flatten(root).includes('fd06:b4d2:9753:1::/64'));
 find(root,n=>n.tag === 'button' && n.children === '返回连接列表').attrs.click();
 assert.equal(window.location.hash,'');
 assert(find(root,n=>n.tag === 'a' && n.attrs.href === '#connection=tdmhome'));
 console.log('Status navigation and detail rendering checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
