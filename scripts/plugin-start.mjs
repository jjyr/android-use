#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// No dependency installation, device enrollment or diagnostics on server startup.
try {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node 24+ required; prepare the plugin with its pinned mise toolchain.');
  const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const cli=join(root,'dist/src/cli.js');
  await access(cli);
  const settingsPath=join(homedir(),'Workspace/Machines/android-use/plugin-runtime.json');
  let settings={};
  try { settings=JSON.parse(await readFile(settingsPath,'utf8')); }
  catch(error) { if(error.code!=='ENOENT')throw new Error('Invalid machine-local plugin-runtime.json'); }
  const path=process.env.ANDROID_USE_CONFIG ?? settings.configPath ?? join(homedir(),'Workspace/Machines/android-use/config.json');
  if(typeof path!=='string'||!isAbsolute(path))throw new Error('ANDROID_USE_CONFIG/configPath must be an absolute path outside the plugin cache.');
  await access(path,constants.R_OK);
  const env={...process.env};
  // Only these explicit, machine-local settings are accepted; do not import arbitrary env.
  for(const key of ['ADB_SERVER_SOCKET','ANDROID_USE_HIERARCHY']) {
    if(env[key]===undefined && typeof settings[key]==='string')env[key]=settings[key];
  }
  const child=spawn(process.execPath,[cli,'mcp','--config',path],{stdio:'inherit',env});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
  child.once('error',()=>{process.stderr.write('android-use: MCP process could not start\n');process.exitCode=1;});
  child.once('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
} catch(error) {
  process.stderr.write('android-use: prepare/build the installed plugin and configure your enrolled phone first; see docs/plugin.md. '+(error.code==='ENOENT'?'Required build or machine configuration is missing.':error.message)+'\n');
  process.exitCode=1;
}
