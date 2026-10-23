import os, tempfile, subprocess, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class ROATest(unittest.TestCase):
 def execute(self, fail='', unchanged=False):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);bird=root/'bird';bird.mkdir();bin=root/'bin';bin.mkdir();lock=root/'locks';lock.mkdir()
   (bird/'dn42_roa.conf').write_text('old4');(bird/'dn42_roa_v6.conf').write_text('old6');(root/'bird.conf').write_text('main')
   scripts={
    'uci': '#!/bin/sh\ncase "$*" in *bird_conf*) echo /etc/bird.conf;; *roa4_url*) echo https://test/4;; *) echo https://test/6;; esac\n',
    'curl': '#!/bin/sh\n[ "$FAIL" = download ] && exit 1\nwhile [ "$1" != -o ];do shift;done\ncase "$2" in *v4*) printf \'%s\' "${DATA}4" > "$2";; *) printf \'%s\' "${DATA}6" > "$2";; esac\n',
    'bird': '#!/bin/sh\n[ "$FAIL" = check ] && exit 1\nexit 0\n',
    'birdc': '#!/bin/sh\n[ "$FAIL" = configure ] && { echo "Configuration error"; exit 0; }\ncase "$*" in configure) echo Reconfigured;; esac\n',
    'logger':'#!/bin/sh\nexit 0\n'}
   for n,s in scripts.items(): f=bin/n;f.write_text(s);f.chmod(0o755)
   s=(ROOT/'root/usr/libexec/dn42/update-roa').read_text().replace('export PATH=/usr/sbin:/usr/bin:/sbin:/bin','export PATH='+str(bin)+':/usr/bin:/bin').replace('/var/lock',str(lock)).replace('/etc/bird/',str(bird)+'/').replace('/tmp/dn42-roa-result',str(root/'result'))
   # Keep UCI value match /etc/bird.conf but use fixture for reads/checks.
   s=s.replace('bird -p -c "$main"','bird -p -c '+str(root/'bird.conf'))
   script=root/'update';script.write_text(s)
   r=subprocess.run(['sh',str(script)],env={**os.environ,'FAIL':fail,'DATA':'old' if unchanged else 'new'},capture_output=True,text=True)
   return r.returncode,(bird/'dn42_roa.conf').read_text(),(bird/'dn42_roa_v6.conf').read_text(),r.stdout
 def test_download_failure_preserves_old(self):
  r,a,b,_=self.execute('download');self.assertNotEqual(r,0);self.assertEqual((a,b),('old4','old6'))
 def test_check_failure_preserves_old(self):
  r,a,b,_=self.execute('check');self.assertNotEqual(r,0);self.assertEqual((a,b),('old4','old6'))
 def test_configure_error_restores(self):
  r,a,b,_=self.execute('configure');self.assertNotEqual(r,0);self.assertEqual((a,b),('old4','old6'))
 def test_unchanged(self):
  r,a,b,out=self.execute(unchanged=True);self.assertEqual(r,0);self.assertIn('无变化',out)
 def test_success(self):
  r,a,b,_=self.execute();self.assertEqual(r,0);self.assertEqual((a,b),('new4','new6'))
if __name__=='__main__':unittest.main()
