"""Exercise SDK package selection without downloading a toolchain."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1]


class SdkSelectionTests(unittest.TestCase):
    def test_package_is_discoverable_by_openwrt_scan(self):
        # include/scan.mk identifies package Makefiles using this expression.
        self.assertRegex((SOURCE / 'Makefile').read_text(),
                         r'call (Build/DefaultTargets|BuildPackage|KernelPackage)')

    def run_sdk(self, selection):
        with tempfile.TemporaryDirectory() as directory:
            sdk = Path(directory)
            for name in ('scripts', 'package', 'mockbin', 'tmp'):
                (sdk / name).mkdir()
            (sdk / 'rules.mk').touch()
            feeds = sdk / 'scripts/feeds'
            feeds.write_text('#!/bin/sh\nexit 0\n')
            feeds.chmod(0o755)
            (sdk / 'tmp/.config-package.in').write_text(
                'config PACKAGE_luci-app-dn42\n\ttristate "DN42"\n')
            make = sdk / 'mockbin/make'
            make.write_text('''#!/bin/sh
set -eu
if [ "$1" = defconfig ]; then
    printf 'CONFIG_PACKAGE_luci-app-dn42=%s\\n' "$SELECTION" > .config
else
    case " $* " in
        *" NO_DEPS=1 "*) ;;
        *) echo 'Recursive dependency compilation was not disabled' >&2; exit 1 ;;
    esac
    touch compile-called
    mkdir -p bin/packages/test
    touch bin/packages/test/luci-app-dn42_1_all.ipk
fi
''')
            make.chmod(0o755)
            env = dict(os.environ, SDK_PREPARED='1', SELECTION=selection,
                       PACKAGE_VERSION='2026.10.24.001234.123.1')
            env['PATH'] = str(sdk / 'mockbin') + os.pathsep + env['PATH']
            result = subprocess.run(
                ['sh', str(SOURCE / 'scripts/sdk-build.sh'), str(SOURCE)],
                cwd=sdk, env=env, capture_output=True, text=True)
            self.assertIn('PKG_VERSION:=2026.10.24.001234.123.1\nPKG_RELEASE:=1',
                          (sdk / 'package/luci-app-dn42/Makefile').read_text())
            return result, (sdk / 'compile-called').exists()

    def test_selected_packages_are_compiled(self):
        for selection in ('m', 'y'):
            with self.subTest(selection=selection):
                result, compiled = self.run_sdk(selection)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue(compiled)

    def test_unselected_package_stops_with_diagnostics(self):
        result, compiled = self.run_sdk('n')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(compiled)
        self.assertIn('config PACKAGE_luci-app-dn42', result.stderr)
        self.assertIn('CONFIG_PACKAGE_luci-app-dn42=n', result.stderr)


if __name__ == '__main__':
    unittest.main()
