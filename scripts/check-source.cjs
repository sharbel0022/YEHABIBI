// Syntax-only validation without needing installed dependencies.
// npm run typecheck / npm run build perform the full checks when npm ci is available.
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
let problems=0;
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const filename=path.join(dir,entry.name);
  if(entry.isDirectory())scan(filename);
  else if(/\.(ts|tsx)$/.test(filename)){
    const source=fs.readFileSync(filename,'utf8');
    const output=ts.transpileModule(source,{fileName:filename,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
    for(const diagnostic of output.diagnostics||[]){
      if(diagnostic.category!==ts.DiagnosticCategory.Error)continue;
      console.error(`${filename}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText,' ')}`);problems++;
    }
  }
}}
scan('src');scan('tests');if(problems){process.exitCode=1}else{console.log('Syntax: all TS/TSX files passed.');}
