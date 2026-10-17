import {test,expect} from '@playwright/test';
test('video + canvas captures real frames, caches and leaves playback position alone',async({page})=>{
  await page.goto('/tests/fixtures/thumbnail.html');
  const result=await page.evaluate(async()=>{
    const url='/src/thumbnails/VideoThumbnailExtractor.ts';
    const {VideoThumbnailExtractor}=await import(url) as typeof import('../../src/thumbnails/VideoThumbnailExtractor');
    const video=document.querySelector('video')!;video.currentTime=.8;
    const extractor=new VideoThumbnailExtractor('/tests/fixtures/thumbnail-test.webm');
    try{
      const first=await extractor.getThumbnail(0);
      const middle=await extractor.getThumbnail(3.23);
      const cached=await extractor.getThumbnail(3.29);
      const last=await extractor.getThumbnail(6);
      return {first:first.dataUrl,middle:middle.dataUrl,cached:cached===middle,last:last.time,width:middle.width,height:middle.height,time:middle.time,mainTime:video.currentTime};
    }finally{extractor.dispose();}
  });
  expect(result.first.startsWith('data:image/jpeg;base64,')).toBe(true);expect(result.first).not.toBe(result.middle);expect(result.cached).toBe(true);expect(result.width).toBe(192);expect(result.height).toBe(108);expect(result.time).toBeCloseTo(3.2,3);expect(result.last).toBeLessThan(6);expect(result.mainTime).toBeCloseTo(.8,3);
});
test('timeline hover, latest request and drag show thumbnail tooltip; leaving hides it',async({page})=>{
  await page.goto('/tests/fixtures/thumbnail.html');
  const canvas=page.getByLabel('GOPシークバー');const box=await canvas.boundingBox();if(!box)throw Error('no timeline');
  const x=(t:number)=>box.x+20+t/6*(box.width-40);
  await page.mouse.move(x(1.2),box.y+70);
  const tooltip=page.getByRole('tooltip');await expect(tooltip).toBeVisible();await expect(tooltip.locator('img')).toBeVisible({timeout:10000});
  await expect(tooltip.locator('strong')).toHaveText('00:01.200');
  const initial=await tooltip.locator('img').getAttribute('src');
  for(const t of [2.1,4.1,2.8,3.4])await page.mouse.move(x(t),box.y+70);
  await expect(tooltip.locator('strong')).toHaveText('00:03.400');await expect(tooltip.locator('img')).toBeVisible();await expect(tooltip.locator('img')).not.toHaveAttribute('src',initial!);
  expect(await page.getByTestId('main-video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBe(0);
  await page.mouse.down();await page.mouse.move(x(4.2),box.y+70);await expect(tooltip).toBeVisible();await page.mouse.up();
  await page.mouse.move(box.x,box.y-30);await expect(tooltip).toHaveCount(0);
});
test('dispose rejects queued captures without leaking video source',async({page})=>{
  await page.goto('/tests/fixtures/thumbnail.html');
  const rejected=await page.evaluate(async()=>{
    const url='/src/thumbnails/VideoThumbnailExtractor.ts';const {VideoThumbnailExtractor}=await import(url) as typeof import('../../src/thumbnails/VideoThumbnailExtractor');
    const e=new VideoThumbnailExtractor('/tests/fixtures/thumbnail-test.webm');const p=e.getThumbnail(2);e.dispose();try{await p;return false;}catch{return true;}
  });expect(rejected).toBe(true);
});
