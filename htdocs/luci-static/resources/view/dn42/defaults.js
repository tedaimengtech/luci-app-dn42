'use strict';
'require view';
'require form';
'require uci';
return view.extend({
 load:function(){return Promise.all([uci.load('dn42'),uci.load('firewall')]);},
 render:function(){
  if(!uci.get('dn42','defaults'))uci.add('dn42','defaults','defaults');
  var m=new form.Map('dn42','新建连接默认值','仅在新建连接时复制到表单，已有连接不受影响。私钥留空时为每条连接自动生成；填写后新连接会共用该私钥。');
  var s=m.section(form.NamedSection,'defaults','defaults');s.addremove=false;
  function field(type,key,title,def,datatype){var o=s.option(type,key,title);if(def!==undefined)o.default=def;if(datatype)o.datatype=datatype;if(type===form.Flag)o.rmempty=false;return o;}
  field(form.Flag,'enabled','启用','1');
  field(form.Value,'asn','远端 ASN',undefined,'uinteger');
  var o=field(form.ListValue,'kind','类型','ebgp');o.value('ebgp','eBGP');o.value('ibgp','iBGP');
  o=field(form.Value,'private_key','本地私钥（留空自动生成）');o.password=true;
  o=field(form.Value,'preshared_key','PSK（可选）');o.password=true;
  field(form.Value,'listen_port','本地 UDP 端口（留空自动）',undefined,'port');
  field(form.Value,'keepalive','NAT 保活秒数','25','range(0,65535)');
  field(form.Value,'local_lla','本地 LLA','fe80::1','ip6addr');
  field(form.Value,'remote_lla','远端 LLA','fe80::2','ip6addr');
  field(form.DynamicList,'addresses','额外本地地址',undefined,'cidr');
  field(form.DynamicList,'allowed_ips','AllowedIPs',undefined,'cidr');
  field(form.Value,'mtu','MTU','1420','range(1280,9000)');
  o=field(form.ListValue,'zone','防火墙区域');o.value('','请选择');uci.sections('firewall','zone',function(z){o.value(z.name);});
  o=field(form.ListValue,'listen_zone','外层 UDP 入站区域');o.value('','不自动放行');uci.sections('firewall','zone',function(z){o.value(z.name);});
  field(form.Flag,'ipv4','IPv4','1');field(form.Flag,'ipv6','IPv6','1');
  field(form.Flag,'transit','使用 transit 模板','0');field(form.Flag,'rr_client','iBGP RR 客户端','0');
  field(form.DynamicList,'internal4','iBGP 允许交换的 IPv4 前缀',undefined,'cidr4');
  field(form.DynamicList,'internal6','iBGP 允许交换的 IPv6 前缀',undefined,'cidr6');
  return Promise.resolve(m.render()).then(function(node){return E('div',{class:'dn42-page'},[E('link',{rel:'stylesheet',href:L.resource('dn42/style.css')}),node]);});
 }
});
