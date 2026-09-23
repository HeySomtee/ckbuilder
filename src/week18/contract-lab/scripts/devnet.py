#!/usr/bin/env python3
"""Own the lifecycle of a fresh, loopback-only dev node and its test runner."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BINARY = ROOT / '.tools/ckb_v0.210.0_x86_64-unknown-linux-gnu/ckb'
PORT = 8218
RPC = f'http://127.0.0.1:{PORT}'
for port in (PORT, PORT + 1):
    with socket.socket() as probe:
        probe.settimeout(1)
        if probe.connect_ex(('127.0.0.1', port)) == 0:
            raise RuntimeError(f'Port {port} is already in use; refusing to touch another node')
RUN = ROOT / '.devnet' / f'run-{time.time_ns()}'
RUN.mkdir(parents=True)
subprocess.run([str(BINARY), 'init', '-C', str(RUN), '--chain', 'dev',
                '--rpc-port', str(PORT), '--p2p-port', str(PORT+1),
                '--ba-arg', '0xc8328aabcd9b9e8e64fbc566c4385c3bdeb219d7',
                '--genesis-message', 'streak-week18-isolated-devnet'], check=True)
config = RUN / 'ckb.toml'
text = config.read_text().replace('/ip4/0.0.0.0/tcp/', '/ip4/127.0.0.1/tcp/')
text = text.replace('"Terminal"]', '"Terminal", "IntegrationTest"]')
config.write_text(text)
log = (RUN / 'node.log').open('w')
process = subprocess.Popen([str(BINARY), 'run', '-C', str(RUN)], stdout=log, stderr=subprocess.STDOUT)
try:
    for _ in range(120):
        if process.poll() is not None:
            raise RuntimeError((RUN / 'node.log').read_text()[-5000:])
        try:
            request = urllib.request.Request(RPC, json.dumps({'id':1,'jsonrpc':'2.0','method':'get_tip_header','params':[]}).encode(), {'Content-Type':'application/json'})
            response = json.load(urllib.request.urlopen(request, timeout=1))
            if 'result' in response:
                break
        except (OSError, ValueError):
            time.sleep(0.25)
    else:
        raise RuntimeError('Dev node did not become ready')
    node = shutil.which('node') or shutil.which('node.exe')
    if not node:
        raise RuntimeError('Node.js 20+ is required')
    script = str(ROOT / 'scripts/devnet.cjs')
    if node.endswith('.exe'):
        script = subprocess.check_output(['wslpath','-w',script], text=True).strip()
    subprocess.run([node, script, RPC], cwd=ROOT, check=True)
finally:
    process.terminate()
    try:
        process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
    log.close()
    print('Local devnet stopped. Logs:', RUN / 'node.log')
