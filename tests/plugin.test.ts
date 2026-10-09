import { it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { PNG } from 'pngjs';
const execute=promisify(execFile);
it('packs a standalone runtime and plugin while excluding private evidence/build outputs',async()=> {
 const cache=await mkdtemp(join(tmpdir(),'android-pack-cache-'));
 try {
 const {stdout}=await execute('npm',['pack','--dry-run','--ignore-scripts','--json','--cache',cache],{cwd:resolve('.'),maxBuffer:1024*1024});
 const packed=JSON.parse(stdout)[0];const paths=packed.files.map((f:any)=>f.path);
 for(const required of ['dist/src/cli.js','dist/src/repl-worker.js','scripts/plugin-start.mjs','.codex-plugin/plugin.json','.mcp.json','skills/android-use/SKILL.md','skills/android-use-setup/SKILL.md','assets/icon.svg','LICENSE','android/accessibility/AndroidManifest.xml'])expect(paths).toContain(required);
 expect(paths.some((p:string)=>/^(?:docs\/notes|node_modules|\.git|\.local)\//.test(p)||p.includes('/build/')||/\.(?:jks|apk|local|mp4)$/.test(p))).toBe(false);
 const packageJson=JSON.parse(await readFile('package.json','utf8'));
 expect(packageJson.bin['android-use']).toBe('dist/src/cli.js');
 } finally { await rm(cache,{recursive:true,force:true}); }
},10000);
it('starts plugin MCP from an unrelated cwd with explicit enrollment and no default traces',async()=> {
 const root=await mkdtemp(join(tmpdir(),'android-plugin-'));const fake=join(root,'adb');const config=join(root,'config.json');
 const p=new PNG({width:20,height:40});p.data.fill(255);const png=PNG.sync.write(p).toString('base64');
 await writeFile(fake,`#!${process.execPath}\nconst a=process.argv.slice(2).join(' ');let s='';if(a==='devices -l')s='List of devices attached\\nfixture device transport_id:1\\n';else if(a.includes('ro.serialno'))s='physical';else if(a.includes('ro.product.model'))s='fixture';else if(a.includes("'dumpsys' 'window'"))s='mCurrentFocus=Window{x u0 com.example.fixture/.Main} isKeyguardShowing=false';else if(a.includes("'dumpsys' 'input'"))s='SurfaceOrientation: 0';else if(a.includes("'dumpsys' 'power'"))s='mWakefulness=Awake';else if(a.includes("'wm' 'size'"))s='Physical size: 20x40';else if(a.includes('screencap')){process.stdout.write(Buffer.from('${png}','base64'));process.exit(0);}else if(a.includes('exec-out cat'))s='<hierarchy><node bounds="[1,1][10,20]" class="android.widget.Button" text="Click" clickable="true" enabled="true"/></hierarchy>';else if(a.includes('get-state'))s='device';process.stdout.write(s);`,{mode:0o755});
 await writeFile(config,JSON.stringify({adbPath:fake,stateDir:root,devices:[{id:'test',expected:{serial:'physical'},wireless:'fixture'}]}));
 const client=new Client({name:'plugin-test',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:[resolve('scripts/plugin-start.mjs')],cwd:root,env:{ANDROID_USE_CONFIG:config,ANDROID_USE_DEBUG:'0',ANDROID_USE_TRACE_CONTENT:'1',ANDROID_USE_TRACE_DIR:join(root,'traces'),ANDROID_USE_HIERARCHY:'uiautomator'},stderr:'pipe'});
 transport.stderr?.on('data',()=>{});
 try {
  await client.connect(transport);
  expect((await client.listTools()).tools.map(t=>t.name)).toEqual(['android_repl']);
  const initial=await client.callTool({name:'android_repl',arguments:{}});const id=JSON.parse((initial.content as any)[0].text).session_id;
  const opened=await client.callTool({name:'android_repl',arguments:{session_id:id,code:"var phone=await android.open({deviceId:'test',connection:'wireless'});"}});
  expect(opened.isError).toBeFalsy();expect((opened.content as any).some((c:any)=>c.type==='image')).toBe(true);
  const state=(opened.content as any).filter((c:any)=>c.type==='text').map((c:any)=>JSON.parse(c.text)).find((c:any)=>c.schemaVersion===1);
  expect(state.elements[0].text).toBe('Click');expect(state.feedback.format).toBe('compact');
  await client.callTool({name:'android_repl',arguments:{session_id:id,code:'await phone.close(); void 0;'}});
  await expect(access(join(root,'traces'))).rejects.toMatchObject({code:'ENOENT'});
 }finally{await client.close();await rm(root,{recursive:true,force:true});}
},10000);
it('fails startup clearly without writing protocol output when enrollment is missing',async()=> {
 const {stdout,stderr}=await execute(process.execPath,[resolve('scripts/plugin-start.mjs')],{env:{...process.env,ANDROID_USE_CONFIG:resolve('/tmp/android-use-nonexistent-enrollment.json')}}).catch(e=>({stdout:e.stdout,stderr:e.stderr}));
 expect(stdout).toBe('');expect(stderr).toContain('Required build or machine configuration is missing');
});
