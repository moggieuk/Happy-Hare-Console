"""Tests for install.sh: the nginx site that serves the Console and its update manager entry."""

import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "install.sh"
CONSOLE = REPO_ROOT / "console"


def nginx_runs():
    try:
        return subprocess.run(["nginx", "-v"], capture_output=True).returncode == 0
    except OSError:
        return False


class TestInstall(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.nginx = self.root / "etc-nginx"
        (self.nginx / "sites-available").mkdir(parents=True)
        (self.nginx / "sites-enabled").mkdir()
        (self.nginx / "conf.d").mkdir()
        (self.nginx / "nginx.conf").write_text("user www-data;\nhttp { include sites-enabled/*; }\n")
        self.calls = self.root / "calls"
        self.stub = self.root / "nginx-stub"
        self.stub.write_text('#!/bin/sh\necho "$@" >> "%s"\n[ -z "$FAIL_NGINX" ] || { echo "bad config" >&2; exit 1; }\n' % self.calls)
        self.stub.chmod(0o755)
        self.console = self.root / "console"
        self.console.mkdir()
        (self.console / "index.html").write_text("<html></html>")
        self.moonraker = self.root / "moonraker.conf"
        self.moonraker.write_text("[server]\nport: 7125\n\n[update_manager mainsail]\ntype: web\n")

    def tearDown(self):
        self.tmp.cleanup()

    def env(self, **env):
        return dict(os.environ, NGINX_DIR=str(self.nginx), NGINX_BIN=str(self.stub), SUDO="", NO_RELOAD="y",
                    CONSOLE_DIR=str(self.console), MOONRAKER_CONF=str(self.moonraker), **env)

    def run_script(self, *args, **env):
        return subprocess.run(["/bin/sh", str(SCRIPT), "-y", *args], env=self.env(**env), text=True,
                              capture_output=True)

    def site(self):
        return self.nginx / "sites-available" / "happy-hare-console"

    def link(self):
        return self.nginx / "sites-enabled" / "happy-hare-console"

    def add_other_site(self, name, port):
        (self.nginx / "sites-enabled" / name).write_text("server {\n    listen %d;\n}\n" % port)

    def test_site_serves_the_folder_and_proxies_moonraker(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        text = self.site().read_text()
        self.assertIn("listen 8090;", text)
        self.assertIn("root %s;" % self.console, text)
        self.assertIn("proxy_pass http://127.0.0.1:7125/websocket;", text)
        self.assertIn("(printer|api|access|machine|server)", text)
        self.assertIsNone(re.search(r"%(PORT|ROOT|UPSTREAM)%", text))
        self.assertTrue(self.link().is_symlink())
        self.assertIn("-t", self.calls.read_text())
        self.assertIn("http://", result.stdout)

    def test_a_taken_port_is_skipped_and_a_rerun_keeps_its_own(self):
        self.add_other_site("mainsail", 8090)
        self.add_other_site("fluidd", 8091)
        self.run_script()
        self.assertIn("listen 8092;", self.site().read_text())
        self.run_script()
        self.assertIn("listen 8092;", self.site().read_text())

    def test_a_given_port_replaces_the_one_in_use(self):
        self.run_script()
        self.run_script("-p", "9000")
        self.assertIn("listen 9000;", self.site().read_text())

    def test_update_manager_entry_is_added_once_and_removed_cleanly(self):
        before = self.moonraker.read_text()
        self.run_script()
        self.run_script()
        text = self.moonraker.read_text()
        self.assertEqual(text.count("[update_manager happy-hare-console]"), 1)
        self.assertIn("type: git_repo\npath: %s\n" % REPO_ROOT, text)
        self.assertIn("[update_manager mainsail]", text)
        self.run_script("-u")
        self.assertEqual(self.moonraker.read_text(), before)

    def test_without_moonraker_conf_the_entry_is_printed(self):
        self.moonraker.unlink()
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("[update_manager happy-hare-console]", result.stdout)
        self.assertFalse(self.moonraker.exists())

    def test_moonraker_port_is_configurable(self):
        self.run_script("-m", "7126")
        self.assertIn("127.0.0.1:7126/websocket", self.site().read_text())

    def test_declining_changes_nothing(self):
        subprocess.run(["/bin/sh", str(SCRIPT)], env=self.env(), text=True, input="n\n", capture_output=True)
        self.assertFalse(self.site().exists())
        self.assertNotIn("happy-hare-console", self.moonraker.read_text())

    def test_a_rejected_configuration_is_rolled_back(self):
        result = self.run_script(FAIL_NGINX="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("bad config", result.stderr)
        self.assertFalse(self.site().exists())
        self.assertFalse(self.link().exists() or self.link().is_symlink())

    def test_a_rejected_rerun_keeps_the_previous_site(self):
        self.run_script()
        before = self.site().read_text()
        self.run_script("-m", "9999", FAIL_NGINX="1")
        self.assertEqual(self.site().read_text(), before)

    def test_remove_leaves_other_sites(self):
        self.add_other_site("mainsail", 80)
        self.run_script()
        self.assertEqual(self.run_script("-u").returncode, 0)
        self.assertFalse(self.site().exists())
        self.assertFalse(self.link().is_symlink())
        self.assertTrue((self.nginx / "sites-enabled" / "mainsail").exists())

    def test_remove_with_nothing_installed_is_quiet(self):
        result = self.run_script("-u")
        self.assertEqual((result.returncode, result.stdout), (0, ""))
        self.assertFalse(self.calls.exists())

    def test_without_nginx_it_explains_and_succeeds(self):
        shutil.rmtree(self.nginx / "sites-enabled")
        result = self.run_script()
        self.assertEqual(result.returncode, 0)
        self.assertIn("nginx was not found", result.stdout)
        self.assertFalse(self.site().exists())

    @unittest.skipUnless(nginx_runs(), "a working nginx is not installed")
    def test_real_nginx_accepts_the_site(self):
        self.run_script()
        logs = self.root / "logs"
        logs.mkdir()
        text = self.site().read_text().replace("/var/log/nginx", str(logs))
        conf = self.root / "nginx.conf"
        conf.write_text("pid %s/nginx.pid;\nerror_log %s/e.log;\nevents {}\nhttp {\n%s\n}\n"
                        % (self.root, logs, text))
        result = subprocess.run(["nginx", "-t", "-c", str(conf), "-p", str(self.root)],
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)


class TestConsoleIsHostable(unittest.TestCase):
    def test_no_root_absolute_assets(self):
        """The same files are served from a sub-path by the simulator and from a port's root by nginx."""
        pattern = re.compile(r"""(?:src|href)\s*=\s*["']/(?!/)|from\s+["']/|import\(\s*["']/|url\(\s*["']?/(?!/)""")
        for path in list(CONSOLE.glob("*.html")) + list(CONSOLE.glob("*.js")) + list(CONSOLE.glob("*.css")):
            if ".test." in path.name or ".browser." in path.name:
                continue
            for number, line in enumerate(path.read_text().splitlines(), 1):
                self.assertIsNone(pattern.search(line), "%s:%d %s" % (path.name, number, line.strip()))


if __name__ == "__main__":
    unittest.main()
