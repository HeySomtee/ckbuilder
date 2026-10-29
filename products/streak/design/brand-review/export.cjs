const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require('../../node_modules/playwright');
const root=__dirname;
async function main(){
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1360,height:1050},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  for(const id of ['breakaway','touchline','form']){
    const dir=path.join(root,'assets',id);
    const source=fs.readFileSync(path.join(dir,'favicon.svg'),'utf8');
    for(const size of [16,32,180,512]){
      await page.setViewportSize({width:size,height:size});
      await page.setContent('<html><style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>'+source+'</html>');
      await page.screenshot({path:path.join(dir,size===180?'apple-touch-icon.png':size===512?'app-icon-512.png':`favicon-${size}.png`),omitBackground:true});
    }
    const images=[16,32].map(size=>fs.readFileSync(path.join(dir,`favicon-${size}.png`)));
    const header=Buffer.alloc(6+16*images.length);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);
    let offset=header.length;
    images.forEach((image,i)=>{const p=6+i*16;header[p]=[16,32][i];header[p+1]=[16,32][i];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(image.length,p+8);header.writeUInt32LE(offset,p+12);offset+=image.length;});
    fs.writeFileSync(path.join(dir,'favicon.ico'),Buffer.concat([header,...images]));
  }
  await page.setViewportSize({width:1360,height:1050});
  await page.goto('http://127.0.0.1:4197/');
  for(const id of ['breakaway','touchline','form']){
    await page.locator(`[data-id="${id}"]`).click();
    await page.screenshot({path:path.join(root,`${id}-preview.png`),fullPage:true});
  }
  await page.locator('[data-id="form"]').click();
  await page.getByRole('button',{name:'Light',exact:true}).click();
  await page.screenshot({path:path.join(root,'form-light-preview.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Dark',exact:true}).click();
  await page.screenshot({path:path.join(root,'mobile-preview.png'),fullPage:true});
  for(const width of [320,390,768,1360]){
    await page.setViewportSize({width,height:900});
    for(const id of ['breakaway','touchline','form']){
      await page.locator(`[data-id="${id}"]`).click();
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(`Overflow ${width} ${id}`);
      if(!(await page.locator('#favicon').getAttribute('href')).includes(id))throw Error('Favicon did not follow selection');
    }
  }
  if(errors.length)throw Error(errors.join('\n'));
  await page.setViewportSize({width:1440,height:704});
  await page.setContent('<style>html,body{margin:0}svg{display:block;width:100%}</style>'+fs.readFileSync(path.join(root,'comparison.svg'),'utf8'));
  await page.screenshot({path:path.join(root,'comparison.png')});
  await browser.close();
  const safari=await webkit.launch({headless:true});const p=await safari.newPage({viewport:{width:390,height:844}});
  await p.goto('http://127.0.0.1:4197/');await p.locator('[data-id="touchline"]').click();await p.getByRole('button',{name:'Light',exact:true}).click();
  if(!(await p.locator('#stage').getAttribute('class')).includes('light'))throw Error('Theme switch failed');
  await safari.close();
  console.log('Exported SVG renders, PNG/ICO icons and desktop/mobile previews. Chromium at 320/390/768/1360 and mobile WebKit passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
