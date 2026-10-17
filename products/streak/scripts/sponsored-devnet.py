#!/usr/bin/env python3
"""Own one fresh loopback CKB node for the product's signed integration tests."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
LAB = ROOT / 'src/week20/contract-lab'
BINARY = LAB / '.tools/ckb_v0.210.0_x86_64-unknown-linux-gnu/ckb'
RPC = 'http://127.0.0.1:8218'
if not BINARY.is_file():
    raise RuntimeError('The pinned CKB 0.210.0 binary is missing. Prepare the Week 20 devnet tools before running this local gate.')
for port in (8218, 8219):
    with socket.socket() as probe:
        probe.settimeout(1)
        if probe.connect_ex(('127.0.0.1', port)) == 0:
            raise RuntimeError(f'Port {port} is occupied. Refusing to touch another node.')

RUN = ROOT / '.quality-artifacts/sponsored-chain' / f'run-{time.time_ns()}'
RUN.mkdir(parents=True)
subprocess.run([str(BINARY), 'init', '-C', str(RUN), '--chain', 'dev',
                '--rpc-port', '8218', '--p2p-port', '8219',
                '--ba-arg', '0xc8328aabcd9b9e8e64fbc566c4385c3bdeb219d7',
                '--genesis-message', 'streak-sponsored-product-isolated-devnet'], check=True)
config = RUN / 'ckb.toml'
contents = config.read_text().replace('/ip4/0.0.0.0/tcp/', '/ip4/127.0.0.1/tcp/')
contents = contents.replace('"Terminal"]', '"Terminal", "Indexer", "IntegrationTest"]')
if '"IntegrationTest"' not in contents:
    raise RuntimeError('The pinned node configuration no longer matches the integration-test setup.')
config.write_text(contents)

env = {**os.environ, 'NODE_ENV': 'test', 'STREAK_SKIP_ENV_FILE': '1'}
for name in list(env):
    if any(part in name.upper() for part in ('SECRET', 'TOKEN', 'PRIVATE_KEY', 'API_KEY', 'PASSWORD', 'DATABASE_URL', 'SUPABASE', 'TELEGRAM', 'API_SPORTS', 'NOTIFY_PROVIDER')):
        del env[name]
env.pop('NODE_OPTIONS', None)
env.pop('STREAK_PUBLIC_ORIGIN', None)

with (RUN / 'node.log').open('w') as log:
    process = subprocess.Popen([str(BINARY), 'run', '-C', str(RUN)], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(120):
            if process.poll() is not None:
                raise RuntimeError((RUN / 'node.log').read_text()[-5000:])
            try:
                request = urllib.request.Request(RPC, json.dumps({'id': 1, 'jsonrpc': '2.0', 'method': 'get_tip_header', 'params': []}).encode(), {'Content-Type': 'application/json'})
                with urllib.request.urlopen(request, timeout=1) as response:
                    if 'result' in json.load(response):
                        break
            except (OSError, ValueError):
                time.sleep(0.25)
        else:
            raise RuntimeError('The isolated node did not become ready.')
        node = shutil.which('node') or shutil.which('node.exe')
        if not node:
            raise RuntimeError('Node.js 24 is required for product integration tests.')
        runner = str(Path(__file__).with_name('sponsored-devnet.cjs'))
        preload = str(ROOT / 'scripts/quality/test-env.cjs')
        if node.endswith('.exe'):
            runner = subprocess.check_output(['wslpath', '-w', runner], text=True).strip()
            preload = subprocess.check_output(['wslpath', '-w', preload], text=True).strip()
        subprocess.run([node, '--require', preload, runner, RPC], cwd=ROOT, env=env, check=True, timeout=480)
    finally:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        print('Owned local CKB node stopped. Logs:', RUN / 'node.log', flush=True)
