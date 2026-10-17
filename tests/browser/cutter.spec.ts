import {test,expect} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';

test('UI: OUT at a boundary includes the following GOP, export and download',async({page})=>{
  await page.goto('/');console.log('Browser MP4 support:',await page.locator('video').evaluate((v:HTMLVideoElement)=>v.canPlayType('video/mp4; codecs="avc1.64001e, mp4a.40.2"')));await page.getByRole('button',{name:'AAC',exact:true}).click();
  await expect(page.getByRole('button',{name:'MP4を書き出す',exact:true})).toBeEnabled({timeout:60000});
  await page.getByRole('button',{name:'GOP ▶',exact:true}).click();
  await expect(page.locator('output')).toHaveText('00:01.000');
  await page.getByRole('button',{name:'現在位置 → IN',exact:true}).click();
  await page.getByRole('button',{name:'現在位置 → OUT',exact:true}).click();
  await expect(page.getByTestId('range')).toHaveText('00:01.000 → 00:02.000');
  await page.getByRole('button',{name:'MP4を書き出す',exact:true}).click();
  const link=page.getByRole('link',{name:'切り出したMP4を保存'});await expect(link).toBeVisible({timeout:60000});
  const pending=page.waitForEvent('download');await link.click();const download=await pending;await download.saveAs('test-results/ui-output.mp4');
  await page.getByLabel('OUT GOP').selectOption('3');await expect(link).toHaveCount(0);
});
for(const name of ['h264_aac.mp4','h264_no_audio.mp4','h264_mp3.mp4','h264_ac3.mp4','h264_ntsc.mp4']) {
  test(`API: ${name} real WASM analysis/cut/verification`,async({page})=>{
    await page.goto('/');
    const result=await page.evaluate(async(name)=>{
      const moduleURL='/src/media/index.ts';
      const {Mp4GopCutter,resolveGopRange}=await import(moduleURL) as typeof import('../../src/media');
      const engine=new Mp4GopCutter();
      try {
        const response=await fetch('/samples/'+name);const input=new File([await response.blob()],name,{type:'video/mp4'});
        const a=await engine.analyzeMp4(input);const times={inSeconds:a.gops[1].start+.15,outSeconds:a.gops[2].start};
        const r=await engine.cutMp4(a,times);
        const again=await engine.cutMp4(a,{inSeconds:0,outSeconds:0});
        if(!again.videoVerified||again.range.firstGop!==0||again.range.lastGop!==0)throw Error('Repeated export failed');
        const preview=await engine.createPreview(a);
        const output=await engine.analyzeMp4(new File([r.blob],'clip.mp4',{type:'video/mp4'}));
        let staleRejected=false;try{await engine.cutMp4(a,times);}catch{staleRejected=true;}
        return {gops:a.gops.length,expected:resolveGopRange(a,times),actual:r.range,verified:r.videoVerified,hasAudio:r.hasAudio,codec:output.audio?.codec??null,duration:output.duration,staleRejected,previewBytes:preview.size,bytes:Array.from(new Uint8Array(await r.blob.arrayBuffer()))};
      }finally{engine.dispose();}
    },name);
    expect(result.gops).toBeGreaterThanOrEqual(3);expect(result.actual).toEqual(result.expected);expect(result.verified).toBe(true);expect(result.staleRejected).toBe(true);expect(Math.abs(result.duration-result.expected.duration)).toBeLessThan(.00005);expect(result.codec).toBe(name==='h264_no_audio.mp4'?null:'aac');expect(result.previewBytes).toBeGreaterThan(1000);
    await mkdir('test-results',{recursive:true});await writeFile('test-results/'+name,Buffer.from(result.bytes));
  });
}
