"""Run the hcorc checks with a disposable desktop and a selected Core binary."""

import argparse
import json
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n")


def prepare_app(root, core, profile, layout):
    settings = {}
    if profile:
        source = profile / "layouts" / f"{layout}.json"
        if not source.is_file():
            raise SystemExit(f"Layout not found: {source}")
        keys = profile / "keys.json"
        if keys.is_file():
            shutil.copy2(keys, root)
        for name in ("mods", "themes", "assets"):
            if (profile / name).is_dir():
                shutil.copytree(profile / name, root / name)
        (root / "layouts").mkdir()
        shutil.copy2(source, root / "layouts")
        state = profile / "layouts/.state" / source.name
        if state.is_file():
            (root / "layouts/.state").mkdir()
            shutil.copy2(state, root / "layouts/.state")
        if (profile / "settings.json").is_file():
            settings = json.loads((profile / "settings.json").read_text())
    settings["core"] = str(core)
    write_json(root / "settings.json", settings)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--core", type=Path, help="Core binary to test (default: hc on PATH)")
    parser.add_argument("--profile", type=Path, help="copy a Herdr app profile into the test window")
    parser.add_argument("--layout", help="personal layout in that profile")
    parser.add_argument("--check-mod", action="append", default=[], help="check an optional mod (repeatable)")
    args = parser.parse_args()
    if bool(args.profile) != bool(args.layout):
        parser.error("--profile and --layout must be used together")
    if args.layout and Path(args.layout).name != args.layout:
        parser.error("--layout must be a layout name")
    if args.check_mod and not args.profile:
        parser.error("--check-mod requires --profile")
    if any(Path(name).name != name or name in ("", "..") for name in args.check_mod):
        parser.error("--check-mod must name a mod folder")
    core = args.core or shutil.which("hc")
    if not core:
        parser.error("hc is missing; pass --core")
    core = Path(core).expanduser().resolve(strict=True)
    desktop = shutil.which("herdr-app")
    if not desktop:
        parser.error("herdr-app is missing from PATH")
    version = subprocess.check_output([core, "--version"], text=True, timeout=10).strip()

    with tempfile.TemporaryDirectory(prefix="orc-hc-", dir="/tmp") as directory:
        root = Path(directory)
        app_home = root / "app"
        app_home.mkdir()
        prepare_app(app_home, core, args.profile, args.layout)
        binaries = root / "bin"
        binaries.mkdir()
        (binaries / "hc").symlink_to(core)
        env = os.environ.copy()
        for key in ("HC_TERMINAL_ID", "HC_PARENT", "HC_SOCKET"):
            env.pop(key, None)
        env.update(
            PATH=f"{binaries}{os.pathsep}{env['PATH']}",
            HC_SESSION="oq" + uuid.uuid4().hex[:6],
            HERDR_APP_HOME=str(app_home),
            HERDR_TELEMETRY="0",
            ORC_HC_TEST_ROOT=str(root),
            ORC_TEST_STATE_DIR=str(root / "state"),
            ORC_LEADS=str(root / "leads.json"),
        )

        def run(command, *, timeout=10, check=True):
            result = subprocess.run(
                command, env=env, cwd=REPO, text=True, capture_output=True, timeout=timeout,
            )
            if check and result.returncode:
                raise RuntimeError(f"{command} failed:\n{result.stdout}{result.stderr}")
            return result

        log = root / "app.log"
        isolated = False
        with log.open("w") as output:
            app = subprocess.Popen([desktop], env=env, cwd=root, stdout=output, stderr=output)
        try:
            for _ in range(50):
                if app.poll() is not None:
                    raise RuntimeError(log.read_text())
                if (app_home / "herdr-app.sock").exists():
                    try:
                        status = run([desktop, "status"], timeout=1, check=False)
                    except subprocess.TimeoutExpired:
                        continue
                    if status.returncode == 0:
                        if json.loads(status.stdout).get("space") is not None:
                            raise RuntimeError("The test desktop connected to an existing workspace")
                        terminals = json.loads(run([core, "ls", "--json"]).stdout)["terminals"]
                        if terminals:
                            raise RuntimeError("The test Core already has terminals")
                        isolated = True
                        break
                time.sleep(0.15)
            else:
                raise RuntimeError("The test desktop did not open:\n" + log.read_text())

            server = json.loads(run([core, "server", "status", "--json"]).stdout)
            if f"hc {server['version']}" != version:
                raise RuntimeError(f"Test app started Core {server['version']}; expected {version}")
            print(f"Testing {version} in isolated Core session {env['HC_SESSION']}", flush=True)
            if args.layout:
                run([desktop, "do", "layout.switch", json.dumps({"name": args.layout})])
            result = subprocess.run(["bash", "tests/test_orc_hc.sh"], env=env, cwd=REPO, timeout=90)
            status = json.loads(run([desktop, "status"]).stdout)
            if status["errors"] or (args.layout and status["layout"] != args.layout):
                raise RuntimeError(f"Desktop layout failed: {status['layout']}, {status['errors']}")
            if args.layout:
                print(f"Layout {args.layout}: loaded with no mod errors")
                for name in args.check_mod:
                    mod = app_home / "mods" / name
                    print(run([desktop, "check", str(mod)]).stdout.strip())
            return result.returncode
        finally:
            if app.poll() is None:
                try:
                    run([desktop, "do", "app.quit"], timeout=4, check=False)
                    app.wait(timeout=4)
                except subprocess.TimeoutExpired:
                    app.terminate()
                    app.wait(timeout=4)
            if isolated:
                run([core, "server", "stop"], check=False)


if __name__ == "__main__":
    raise SystemExit(main())
