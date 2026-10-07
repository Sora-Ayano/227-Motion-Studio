"""Build a complete native Unity payload from an audited portable package and a compiled Unity player."""
from pathlib import Path
import argparse, hashlib, json, os, re, shutil, struct

def strip_debug_symbols(file):
    """Remove PE debug directory and CodeView/embedded PDB payloads from our unsigned assembly."""
    data=bytearray(file.read_bytes())
    pe=struct.unpack_from('<I',data,60)[0]
    optional=pe+24
    directory=optional+(112 if struct.unpack_from('<H',data,optional)[0]==0x20b else 96)
    address,size=struct.unpack_from('<II',data,directory+48)
    if not size:return
    section=pe+24+struct.unpack_from('<H',data,pe+20)[0]
    count=struct.unpack_from('<H',data,pe+6)[0]
    position=None
    for i in range(count):
        virtual_size,virtual_address,raw_size,raw_offset=struct.unpack_from('<IIII',data,section+i*40+8)
        if virtual_address<=address<virtual_address+max(virtual_size,raw_size):
            position=raw_offset+address-virtual_address;break
    if position is None or size%28:raise RuntimeError('Invalid PE debug directory')
    for i in range(size//28):
        _,_,_,_,kind,length,_,offset=struct.unpack_from('<IIHHIIII',data,position+i*28)
        if offset+length>len(data):raise RuntimeError('Invalid debug payload')
        if length:data[offset:offset+length]=b'\0'*length
    data[position:position+size]=b'\0'*size
    data[directory+48:directory+56]=b'\0'*8
    file.write_bytes(data)

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base', required=True, type=Path)
parser.add_argument('--player', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
parser.add_argument('--verify-only', action='store_true', help='Audit an existing generated payload without changing it')
args = parser.parse_args()
source = Path(__file__).resolve().parents[1]
base, player, output = args.base.resolve(), args.player.resolve(), args.output.resolve()
metadata=json.loads((source/'package.json').read_text(encoding='utf8'))
forbidden = {'.git', '.aws', '.codex', '.agents', 'logs', 'exports', 'imported', 'screenshots', 'test-output', '__pycache__', 'desktop-profile', 'desktop-diagnostics', 'native-diagnostics', 'native-render', 'updates'}
private_suffixes = {'.log', '.nana', '.pyc', '.pyo'}
if not args.verify_only:
    if output.exists() and any(output.iterdir()):
        raise RuntimeError('Output must be empty; never overwrite existing personal files')
    if output == base or base in output.parents or output in base.parents:
        raise RuntimeError('Input and output must be separate directories')
    if not (player / '22-7 Motion Studio.exe').is_file():
        raise RuntimeError('Compiled Unity player is required')
    output.mkdir(parents=True, exist_ok=True)
    forbidden = {'.git', '.aws', '.codex', '.agents', 'logs', 'exports', 'imported', 'screenshots', 'test-output', '__pycache__', 'desktop-profile', 'desktop-diagnostics', 'native-diagnostics', 'native-render', 'updates'}
    private_suffixes = {'.log', '.nana', '.pyc', '.pyo'}
    checksums = base / 'files.sha256'
    if not checksums.is_file():
        raise RuntimeError('Audited portable files.sha256 is required')
    entries = checksums.read_text(encoding='utf8').splitlines()
    for line in entries:
        digest, relative = line.split('  ', 1)
        item = base / relative
        item.resolve().relative_to(base)
        if item.is_symlink() or not item.is_file():
            raise RuntimeError('Invalid portable source')
        if set(item.relative_to(base).parts) & forbidden or item.suffix in private_suffixes:
            raise RuntimeError('Private/generated content in portable manifest')
        with item.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != digest:
                raise RuntimeError('Portable file changed after audit: ' + relative)
        dest = output / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(item, dest)
    print(json.dumps({'copiedPortableFiles': len(entries)}), flush=True)

    def publishable(relative):
        name = relative.as_posix()
        if name in {'server.mjs','package.json','package-lock.json','config.example.json','.gitattributes','.gitignore','README.md','LICENSE','NOTICE','THIRD_PARTY_NOTICES.md','requirements.txt'}:
            return True
        if len(relative.parts)==2 and relative.parts[0]=='tools' and relative.suffix in {'.mjs','.ps1','.py'}:
            return relative.name in {'blender-render.mjs', 'blender-render.py', 'blender_look.py', 'blender_materials.py', 'blender_grade.py', 'blender_physics.py', 'native-look.mjs','import-smpl-motion.mjs', 'comfy-bridge.mjs', 'blender-bake.mjs', 'blender-cloth.py', 'blender-character.py', 'setup-blender.mjs', 'open-blender.mjs', 'frame-video.mjs','video-encoder.mjs','mp4.mjs','prepare-vendor.mjs','start-studio.ps1','portable-service.ps1','unity_export.py','github-update.mjs','apply-update.mjs','build-native.ps1','build-native-package.py'}
        if relative.parts[0] in {'docs','licenses'}:
            return relative.suffix in {'.md','.txt','.cjs','.json','.iss','.ico'}
        if relative.parts[0]=='web' and len(relative.parts)==2:
            return relative.suffix in {'.mjs','.html','.css','.svg','.png'}
        if relative.parts[:2] in {('web','core'),('web','lib'),('web','unity-package'),('web','models')}:
            return relative.suffix in {'.mjs','.js','.cs','.shader','.task','.json','.txt','.md'}
        return False

    for item in source.rglob('*'):
        relative = item.relative_to(source)
        if item.is_file() and publishable(relative):
            dest = output / 'studio' / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(item, dest)
    for item in player.rglob('*'):
        if item.is_file() and item.suffix not in {'.pdb','.mdb','.log'}:
            dest = output / item.relative_to(player)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(item, dest)
            if dest.name=='Assembly-CSharp.dll':strip_debug_symbols(dest)
    shutil.copyfile(source/'desktop-unity/app.ico',output/'studio/native-app.ico')
    package_manifest=json.loads((base/'package-manifest.json').read_text(encoding='utf8'))
    package_manifest.update(version=metadata['version'],browserBundled=False,nativeEngine='Unity 2022.3 LTS',startup='22-7 Motion Studio.exe')
    (output/'package-manifest.json').write_text(json.dumps(package_manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (output/'启动.cmd').write_text('@echo off\r\nstart "" "%~dp0'+'22-7 Motion Studio.exe" %*\r\n',encoding='utf8')
    (output/'一键包说明.md').write_text((source/'docs/DESKTOP.md').read_text(encoding='utf8'),encoding='utf8')
metadata=json.loads((source/'package.json').read_text(encoding='utf8'))

# Match the build machine's workspace/account paths dynamically; never publish them.
markers = [str(source.parent).lower().encode(), str(Path.home()).lower().encode()]
computer = os.environ.get('COMPUTERNAME', '').lower().encode()
if computer: markers.append(computer)
secrets = re.compile(rb'(?i)(github_' + rb'pat_[a-z0-9_]{20,}|gh[pousr]_[a-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]{80,}-----END)')
absolute = re.compile(r'(?i)(?<![a-z])[a-z]:(?:\\|/(?!/))')
manifest = []
for item in sorted(output.rglob('*')):
    if not item.is_file() or item.name=='files.sha256': continue
    relative = item.relative_to(output)
    if item.is_symlink(): raise RuntimeError('Symbolic links are not allowed')
    if set(relative.parts) & forbidden or item.suffix in private_suffixes or item.name.endswith('.nana.json'):
        raise RuntimeError('Private/generated output: '+relative.as_posix())
    data=item.read_bytes(); folded=data.lower()
    if any(marker and marker in folded for marker in markers):
        raise RuntimeError('Private machine content in: '+relative.as_posix())
    if item.suffix in {'.json','.md','.txt','.js','.mjs','.cjs','.py','.ps1','.cmd','.html','.cs'} and secrets.search(data):
        raise RuntimeError('Credential content in: '+relative.as_posix())
    if item.suffix=='.json' and 'node_modules' not in relative.parts and absolute.search(data.decode('utf8')):
        raise RuntimeError('Absolute resource path in: '+relative.as_posix())
    manifest.append(hashlib.sha256(data).hexdigest()+'  '+relative.as_posix())
(output/'files.sha256').write_text('\n'.join(manifest)+'\n',encoding='utf8')
print(json.dumps({'version':metadata['version'],'files':len(manifest),'privateMatches':0,'bytes':sum(p.stat().st_size for p in output.rglob('*') if p.is_file())}),flush=True)
