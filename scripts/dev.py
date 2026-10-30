"""Run API, worker and Vite together; terminate every process group on exit."""
import os
import errno
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main():
    if not shutil.which('npm') or not (ROOT / 'web/node_modules').is_dir():
        print('Install frontend dependencies first: cd web && npm ci', file=sys.stderr)
        return 1
    env = os.environ.copy()
    # Match the documented SQLite development setup; Compose configuration is separate.
    env['DATABASE_URL'] = env.get('CAPSTONE_DEV_DATABASE_URL', 'sqlite:///./capstone.db')
    env['REDIS_URL'] = env.get('CAPSTONE_DEV_REDIS_URL', '')
    env['CAPSTONE_GRAPH'] = env.get('CAPSTONE_DEV_GRAPH', 'offline')
    api_port = int(env.get('CAPSTONE_PORT', '8000'))
    web_port = int(env.get('CAPSTONE_DEV_WEB_PORT', '5173'))
    env['CAPSTONE_PUBLIC_URL'] = f'http://127.0.0.1:{web_port}'
    env['VITE_API_TARGET'] = f'http://127.0.0.1:{api_port}'
    children = []

    def stop(signum, frame):
        raise KeyboardInterrupt

    def start(args, cwd=ROOT):
        child = subprocess.Popen(args, cwd=cwd, env=env, start_new_session=True)
        children.append(child)
        return child

    signal.signal(signal.SIGTERM, stop)
    try:
        for port in (api_port, web_port):
            with socket.socket() as probe:
                try:
                    probe.bind(('127.0.0.1', port))
                except OSError as exc:
                    if exc.errno != errno.EADDRINUSE:
                        raise
                    raise RuntimeError(f'Port {port} is already in use; choose another development port') from None
        subprocess.run([sys.executable, '-m', 'capstone.init_db'], cwd=ROOT, env=env, check=True)
        api = start([sys.executable, '-m', 'uvicorn', 'capstone.asgi:app', '--reload',
                     '--host', '127.0.0.1', '--port', str(api_port)])
        deadline = time.monotonic() + 30
        while True:
            if api.poll() is not None:
                raise RuntimeError('API exited during startup')
            try:
                with urllib.request.urlopen(f'{env["VITE_API_TARGET"]}/health/ready', timeout=1):
                    break
            except (urllib.error.URLError, TimeoutError):
                if time.monotonic() >= deadline:
                    raise RuntimeError('API did not become ready within 30 seconds') from None
                time.sleep(0.2)
        start([sys.executable, '-m', 'capstone.worker'])
        start(['npm', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', str(web_port), '--strictPort'], ROOT / 'web')
        print(f'\nCapstone: http://127.0.0.1:{web_port} | API docs: {env["VITE_API_TARGET"]}/docs\n'
              'Press Ctrl+C to stop all services.\n', flush=True)
        while True:
            for child in children:
                if child.poll() is not None:
                    raise RuntimeError(f'A development service exited (status {child.returncode})')
            time.sleep(0.25)
    except KeyboardInterrupt:
        return 0
    except (RuntimeError, subprocess.CalledProcessError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    finally:
        # Uvicorn reload and npm spawn descendants: stop their entire process groups.
        for child in children:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        deadline = time.monotonic() + 5
        for child in children:
            try:
                child.wait(timeout=max(0.1, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                pass
        for child in children:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


if __name__ == '__main__':
    raise SystemExit(main())
