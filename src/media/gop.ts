import type { CutPoints, Gop, GopRange, Mp4Analysis } from './types';
/** Boundary belongs to the GOP starting at that boundary. EOF belongs to no GOP. */
export function findGopAtTime(gops: readonly Gop[], seconds: number): Gop {
  if (!Number.isFinite(seconds) || !gops.length || seconds < gops[0].start || seconds >= gops[gops.length-1].end)
    throw new Error('現在位置は映像の範囲内（末尾より前）にしてください。');
  let lo=0, hi=gops.length-1;
  while(lo<hi) { const mid=Math.ceil((lo+hi)/2); if(gops[mid].start<=seconds)lo=mid;else hi=mid-1; }
  return gops[lo];
}
export function snapIn(gops: readonly Gop[], seconds: number): number { return findGopAtTime(gops,seconds).start; }
/** Exact GOP start selects that GOP's END too: the requested position is included. */
export function snapOut(gops: readonly Gop[], seconds: number): number {
  if(gops.length && seconds===gops[gops.length-1].end)return seconds;
  return findGopAtTime(gops,seconds).end;
}
export function resolveGopRange(analysis: Mp4Analysis, points: CutPoints): GopRange {
  const {inSeconds,outSeconds}=points;
  if(!Number.isFinite(inSeconds)||!Number.isFinite(outSeconds)||inSeconds<0||outSeconds<inSeconds||outSeconds>analysis.duration)
    throw new Error('0 ≤ IN ≤ OUT ≤ 動画の長さで指定してください。');
  const first=findGopAtTime(analysis.gops,inSeconds);
  const last=outSeconds===analysis.duration?analysis.gops[analysis.gops.length-1]:findGopAtTime(analysis.gops,outSeconds);
  return {firstGop:first.index,lastGop:last.index,start:first.start,end:last.end,duration:last.end-first.start,
    frameCount:analysis.gops.slice(first.index,last.index+1).reduce((sum,g)=>sum+g.frameCount,0)};
}
