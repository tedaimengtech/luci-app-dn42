'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const store={defaults:{private_key:'default-private',local_lla:'fe80::9',addresses:['192.0.2.1/32'],allowed_ips:['172.20.0.0/14'],mtu:'1400',ipv6:'0'},existing:{private_key:'existing-private'}};
let map,modal;
const uci={get:(_,id,key)=>key?store[id]&&store[id][key]:store[id],set:(_,id,key,value)=>{store[id][key]=value;},add:(_,type,name)=>{assert(!store[name]);store[name]={'.type':type};return name;},sections(){},load:()=>Promise.resolve()};
const form={Flag:class{},Value:class{},ListValue:class{},DynamicList:class{},Button:class{},GridSection:class{},Map:class {
 constructor(){map=this;this.data=uci;}
 section(){return {option(){return {value(){}};},renderMoreOptionsModal(id){modal=id;return Promise.resolve();}};}
 render(){return this;}
}};
const page=new Function('view','form','uci','rpc','ui','E','L',fs.readFileSync('htdocs/luci-static/resources/view/dn42/peers.js','utf8'))({extend:x=>x},form,uci,{declare:()=>()=>{}},{},(tag,attrs,children)=>({tag,attrs,children}),{resource:path=>path});
let section;
const original=form.Map.prototype.section;
form.Map.prototype.section=function(){section=original.call(this);return section;};
page.render();
// Exercise the real Add handler; no synthetic addedSection marker.
section.handleAdd(null,'fresh');
assert.equal(modal,'fresh');
assert.equal(map.addedSection,'fresh');
assert.equal(store.fresh.private_key,'default-private');
assert.equal(store.fresh.local_lla,'fe80::9');
assert.equal(store.fresh.ipv6,'0');
assert.deepEqual(store.fresh.addresses,['192.0.2.1/32']);
assert.deepEqual(store.fresh.allowed_ips,['172.20.0.0/14']);
store.fresh.addresses.push('198.51.100.1/32');
assert.equal(store.defaults.addresses.length,1);
store.fresh.mtu='1380';
section.renderMoreOptionsModal('fresh');
assert.equal(store.fresh.mtu,'1380');
section.renderMoreOptionsModal('existing');
assert.deepEqual(store.existing,{private_key:'existing-private'});
store.defaults.mtu='1300';
section.handleAdd(null,'second');
assert.equal(store.second.mtu,'1300');
assert.equal(store.fresh.mtu,'1380');
console.log('New connection defaults checks passed');
