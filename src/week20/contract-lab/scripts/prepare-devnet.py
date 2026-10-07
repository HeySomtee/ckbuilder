#!/usr/bin/env python3
"""Download an official CKB binary and initialize an isolated local dev chain."""
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
VERSION = '0.210.0'
TOOLS = ROOT / '.tools'
TOOLS.mkdir(exist_ok=True)
NAME = f'ckb_v{VERSION}_x86_64-unknown-linux-gnu'
ARCHIVE = TOOLS / (NAME + '.tar.gz')
BINARY = TOOLS / NAME / 'ckb'
EXPECTED_SHA256 = '68a94c191109bae172f8dcb71828dbdf0383e2c314e0658743db217472b27bdf'
if not BINARY.exists():
    url = f'https://github.com/nervosnetwork/ckb/releases/download/v{VERSION}/{ARCHIVE.name}'
    print('Downloading', url, flush=True)
    urllib.request.urlretrieve(url, ARCHIVE)
    if hashlib.sha256(ARCHIVE.read_bytes()).hexdigest() != EXPECTED_SHA256:
        raise RuntimeError('Unexpected CKB release archive checksum')
    with tarfile.open(ARCHIVE) as archive:
        archive.extractall(TOOLS, filter='data')
print(json.dumps({'ckb': VERSION, 'archive_sha256': hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()}))
subprocess.run([str(BINARY), '--version'], check=True)
