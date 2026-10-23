"""Check cold/warm CI packaging and checksum failures without network or SDKs."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1]
MOCK = r'''#!/usr/bin/env python3
import hashlib, os, pathlib, sys
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ['TOOL_LOG'], 'a') as log:
    log.write(name + ' ' + ' '.join(args) + '\n')
if name == 'curl':
    destination = pathlib.Path(args[args.index('-o') + 1])
    if destination.name == 'sha256sums':
        digest = hashlib.sha256(b'sdk').hexdigest()
        if os.environ.get('BAD_CHECKSUM'):
            digest = '0' * 64
        destination.write_text('\n'.join(
            f'{digest} *openwrt-sdk-{release}-x86-64_gcc-{compiler}_musl.Linux-x86_64.tar.zst'
            for release, compiler in [('24.10.4', '13.3.0'), ('25.12.6', '14.3.0')]) + '\n')
    else:
        destination.write_bytes(b'sdk')
elif name == 'tar':
    sdk = pathlib.Path(args[args.index('-C') + 1])
    (sdk / 'scripts').mkdir(parents=True, exist_ok=True)
    (sdk / 'package').mkdir(exist_ok=True)
    (sdk / 'rules.mk').touch()
    (sdk / 'feeds.conf.default').write_text(
        'src-git --root=package base base-url\nsrc-git packages packages-url\n'
        'src-git luci luci-url\nsrc-git routing routing-url\n')
    feed = sdk / 'scripts/feeds'
    feed.write_text('#!/bin/sh\nprintf "feeds %s\\n" "$*" >> "$TOOL_LOG"\n')
    feed.chmod(0o755)
elif name == 'make' and args != ['defconfig']:
    assert 'NO_DEPS=1' in args, args
    version = os.environ['PACKAGE_VERSION']
    out = pathlib.Path('bin/packages/test')
    out.mkdir(parents=True, exist_ok=True)
    if '25.12.6' in str(pathlib.Path.cwd()):
        filename = f'luci-app-dn42-{version}-r1.apk'
    else:
        filename = f'luci-app-dn42_{version}-r1_all.ipk'
    (out / filename).write_text('package')
'''


class CiBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ('scripts', 'root', 'htdocs', 'mockbin'):
            (self.root / name).mkdir()
        for name in ('ci-build.sh', 'sdk-build.sh'):
            shutil.copy(SOURCE / 'scripts' / name, self.root / 'scripts' / name)
        for name in ('Makefile', 'LICENSE'):
            shutil.copy(SOURCE / name, self.root / name)
        (self.root / 'root/example').touch()
        (self.root / 'htdocs/example').touch()
        for name in ('curl', 'tar', 'make'):
            path = self.root / 'mockbin' / name
            path.write_text(MOCK)
            path.chmod(0o755)
        self.log = self.root / 'tools.log'
        self.env = dict(os.environ, CI='false', TOOL_LOG=str(self.log),
                        PATH=str(self.root / 'mockbin') + os.pathsep + os.environ['PATH'])

    def build(self, version):
        self.env['PACKAGE_VERSION'] = version
        return subprocess.run(['bash', str(self.root / 'scripts/ci-build.sh')],
                              env=self.env, capture_output=True, text=True)

    def test_cold_then_warm_cache_only_publishes_current_packages(self):
        result = self.build('2026.10.24.010000.1.1')
        self.assertEqual(result.returncode, 0, result.stderr)
        for config in (self.root / '.cache/openwrt-ci').glob('*/feeds.conf'):
            self.assertNotIn('routing', config.read_text())
            self.assertIn('--root=package base', config.read_text())
        calls = self.log.read_text().splitlines()
        self.assertEqual(sum(line.startswith('curl ') for line in calls), 4)
        self.assertEqual(sum(line.startswith('tar ') for line in calls), 2)
        result = self.build('2026.10.24.020000.2.1')
        self.assertEqual(result.returncode, 0, result.stderr)
        extra = self.log.read_text().splitlines()[len(calls):]
        self.assertTrue(all(line.startswith('make ') for line in extra), extra)
        artifacts = list((self.root / 'artifacts').iterdir())
        self.assertEqual({file.suffix for file in artifacts}, {'.ipk', '.apk'})
        self.assertEqual(len(artifacts), 2)
        self.assertTrue(all('020000.2.1' in file.name for file in artifacts))

    def test_bad_checksum_stops_before_extraction(self):
        self.env['BAD_CHECKSUM'] = '1'
        result = self.build('2026.10.24.010000.1.1')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('tar ', self.log.read_text())
        self.assertNotIn('make ', self.log.read_text())


if __name__ == '__main__':
    unittest.main()
