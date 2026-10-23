'use strict';

function protocols(text) {
 var rows=[];
 String(text||'').split('\n').forEach(function(line){
  var m=line.match(/^(\S+)\s+(BGP)\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/);
  if(m)rows.push({name:m[1],state:m[4],since:m[5],info:(m[6]||'').trim()});
 });
 return rows;
}
function bgp(text) {
 var result={sessions:protocols(text),fields:[],channels:[]},channel=null;
 String(text||'').split('\n').forEach(function(line){
  var m=line.match(/^\s*Channel\s+([^:]+):?\s*$/);
  if(m){channel={name:m[1].trim(),fields:[]};result.channels.push(channel);return;}
  m=line.match(/^\s*(BGP state|Neighbor address|Neighbor AS|Local AS|Neighbor ID|Local capabilities|Session|Source address|Last error|State|Table|Preference|Input filter|Output filter|Routes|Route change stats|BGP Next hop|IGP IPv[46] table):\s*(.*?)\s*$/);
  if(m)(channel?channel.fields:result.fields).push([m[1],m[2]]);
 });
 return result;
}
function wireguard(text) {
 var result={iface:null,peers:[]},peer=null;
 String(text||'').split('\n').forEach(function(line){
  var m=line.match(/^interface:\s*(.+)$/);
  if(m){result.iface=m[1];return;}
  m=line.match(/^peer:\s*(.+)$/);
  if(m){peer={public_key:m[1]};result.peers.push(peer);return;}
  m=line.match(/^\s*(public key|listening port|endpoint|allowed ips|latest handshake|transfer|persistent keepalive):\s*(.*)$/);
  if(m)(peer||result)[m[1].replace(/ /g,'_')]=m[2];
 });
 return result;
}
function routes(text) {
 var rows=[];
 String(text||'').split('\n').forEach(function(line){
  var words=line.trim().split(/\s+/);if(!line.trim())return;
  var type='unicast';if(['local','broadcast','multicast','unreachable','blackhole','prohibit','throw','unicast'].indexOf(words[0])>=0)type=words.shift();
  if(!words[0]||words[0]==='nexthop')return;
  function value(key,fallback){var i=words.indexOf(key);return i>=0?words[i+1]:fallback;}
  rows.push({prefix:words[0],gateway:value('via','直连'),table:value('table','main'),metric:value('metric','—'),type:type});
 });
 return rows;
}
return L.Class.extend({protocols:protocols,bgp:bgp,wireguard:wireguard,routes:routes});
