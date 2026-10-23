'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require ui';
var commit=rpc.declare({object:'uci',method:'commit',params:['config']});
var preview=rpc.declare({object:'luci.dn42',method:'preview',params:['name']});
var remove=rpc.declare({object:'luci.dn42',method:'remove',params:['name']});
var apply = rpc.declare({object:'luci.dn42', method:'apply', params:['name']});
return view.extend({
 load: function() { return Promise.all([uci.load('dn42'),uci.load('firewall')]); },
 render: function() {
 var m = new form.Map('dn42','DN42 连接','WireGuard 与防火墙通过 UCI 管理。先保存，再生成并应用。现有手工配置不会被自动接管。');
 var s=m.section(form.GridSection,'peer','连接'); s.addremove=true; s.anonymous=false;
 var renderModal=s.renderMoreOptionsModal;
 s.renderMoreOptionsModal=function(id){
  if(m.addedSection===id){
   ['enabled','asn','kind','private_key','preshared_key','listen_port','keepalive','local_lla','remote_lla','addresses','allowed_ips','mtu','zone','listen_zone','ipv4','ipv6','transit','rr_client','internal4','internal6'].forEach(function(key){
    var value=uci.get('dn42','defaults',key);
    if(value!==undefined&&value!==null&&uci.get('dn42',id,key)==null)uci.set('dn42',id,key,Array.isArray(value)?value.slice():value);
   });
  }
  return renderModal.apply(this,arguments);
 };
 s.handleRemove=function(id){if(!window.confirm('删除此连接的 WireGuard、BIRD 和防火墙配置？'))return Promise.resolve();return remove(id).then(function(r){if(!r.ok){ui.addNotification(null,E('pre',{},r.message),'error');return;}uci.remove('dn42',id);return m.save().then(function(){return commit('dn42');}).then(function(){window.location.reload();});});};
 function field(type,key,title,def) { var o=s.option(type,key,title); if(type===form.Flag)o.rmempty=false; if(['enabled','asn','label','kind','iface','generate'].indexOf(key)<0)o.modalonly=true; if(def!==undefined)o.default=def; return o; }
 field(form.Flag,'enabled','启用','1');
 field(form.Value,'asn','远端 ASN').datatype='uinteger';
 field(form.Value,'label','对方 / 节点名称');
 var o=field(form.ListValue,'kind','类型','ebgp');o.value('ebgp','eBGP');o.value('ibgp','iBGP');
 field(form.Value,'iface','独立 WireGuard 接口').datatype='uciname';
 field(form.Value,'public_key','远端公钥');
 o=field(form.Value,'private_key','本地私钥（留空自动生成）');o.password=true;
 o=field(form.Value,'preshared_key','PSK（可选）');o.password=true;
 field(form.Value,'endpoint','远端域名 / IP（被动模式留空）');
 field(form.Value,'endpoint_port','远端 UDP 端口').datatype='port';
 field(form.Value,'listen_port','本地 UDP 端口（留空自动）').datatype='port';
 field(form.Value,'keepalive','NAT 保活秒数','25').datatype='range(0,65535)';
 field(form.Value,'local_lla','本地 LLA','fe80::1').datatype='ip6addr';
 field(form.Value,'remote_lla','远端 LLA','fe80::2').datatype='ip6addr';
 field(form.DynamicList,'addresses','额外本地地址').datatype='cidr';
 field(form.DynamicList,'allowed_ips','AllowedIPs','').datatype='cidr';
 field(form.Value,'mtu','MTU','1420').datatype='range(1280,9000)';
 o=field(form.ListValue,'zone','防火墙区域');uci.sections('firewall','zone',function(z){o.value(z.name);});
 o=field(form.ListValue,'listen_zone','外层 UDP 入站区域（指定本地端口时）');o.value('','不自动放行');uci.sections('firewall','zone',function(z){o.value(z.name);});
 field(form.Flag,'ipv4','IPv4','1');field(form.Flag,'ipv6','IPv6','1');
 field(form.Flag,'transit','使用 transit 模板','0');
 field(form.Flag,'rr_client','iBGP RR 客户端','0');
 field(form.DynamicList,'internal4','iBGP 允许交换的 IPv4 前缀').datatype='cidr4';
 field(form.DynamicList,'internal6','iBGP 允许交换的 IPv6 前缀').datatype='cidr6';
 o=field(form.Button,'generate','应用连接');o.editable=true;o.inputtitle='保存并应用';o.inputstyle='apply';
 o.onclick=function(ev,id){return m.save().then(function(){return commit('dn42');}).then(function(){return preview(id).then(function(r){if(!r.ok) return r;return new Promise(function(resolve){ui.showModal('确认配置',[E('pre',{style:'max-height:60vh;overflow:auto'},r.message),E('button',{class:'btn',click:function(){ui.hideModal();resolve({ok:true,message:'已取消'});}},'取消'),E('button',{class:'btn cbi-button-positive',click:function(){ui.hideModal();apply(id).then(resolve);}},'应用')]);});});}).then(function(r){ui.addNotification(null,E('pre',{},r.message||JSON.stringify(r)),r.ok?'info':'error');});};
 return m.render();
 }
});
