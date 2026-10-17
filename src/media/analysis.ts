import type { Mp4Analysis } from './types';
export interface Packet { pts_time: string; dts_time: string; duration_time: string; pos: string; size: string; flags?: string }
export interface Stream { codec_name: string; codec_tag_string?: string; nal_length_size?: string; width?: number; height?: number; start_time?: string; sample_rate?: string }
export interface ProbeResult { streams?: Stream[]; packets?: Packet[]; format?: { start_time?: string } }
export const pts=(p:Packet)=>Number(p.pts_time);
export function hasIdr(data: Uint8Array,lengthSize:number):boolean {
  if(![1,2,4].includes(lengthSize))return false;
  let offset=0, found=false;
  while(offset<data.length) {
    if(offset+lengthSize>data.length)return false;
    let size=0;for(let j=0;j<lengthSize;j++)size=size*256+data[offset++];
    if(size<=0||offset+size>data.length)return false;
    found ||= (data[offset]&31)===5;
    offset+=size;
  }
  return found;
}
export async function buildAnalysis(file: File,video: ProbeResult,audio: ProbeResult):Promise<{analysis:Mp4Analysis;packets:Packet[]}> {
  const stream=video.streams?.[0],packets=video.packets??[];
  if(stream?.codec_name!=='h264'||stream.codec_tag_string!=='avc1')throw new Error('avc1形式のH.264 MP4に対応しています。');
  if(!packets.length)throw new Error('映像パケットがありません。');
  if(Math.abs(Number(stream.start_time??0))>1e-6||Math.abs(Number(video.format?.start_time??0))>1e-6)throw new Error('初期版は映像・コンテナの開始時刻が0のMP4に限定しています。');
  for(const p of packets) {
    if(![p.pts_time,p.dts_time,p.duration_time,p.pos,p.size].every(x=>x!==undefined&&Number.isFinite(Number(x)))||Number(p.duration_time)<=0||Number(p.pos)<0||Number(p.size)<=0||Number(p.pos)+Number(p.size)>file.size)
      throw new Error('時刻またはデータ位置が不明なMP4は処理できません。');
  }
  const starts:{time:number;packet:number}[]=[];
  for(let i=0;i<packets.length;i++) {
    const p=packets[i];if(!p.flags?.includes('K'))continue;
    const data=new Uint8Array(await file.slice(Number(p.pos),Number(p.pos)+Number(p.size)).arrayBuffer());
    if(hasIdr(data,Number(stream.nal_length_size??4)))starts.push({time:pts(p),packet:i});
  }
  if(starts[0]?.packet!==0||Math.abs(starts[0]?.time??Infinity)>1e-6)throw new Error('先頭がIDRのMP4を選択してください。');
  let duration=0;for(const p of packets)duration=Math.max(duration,pts(p)+Number(p.duration_time));
  starts.push({time:duration,packet:packets.length});
  const gops=[];
  for(let i=0;i<starts.length-1;i++) {
    const a=starts[i],b=starts[i+1],group=packets.slice(a.packet,b.packet).sort((x,y)=>pts(x)-pts(y));
    if(!group.length||Math.abs(pts(group[0])-a.time)>2e-5||Math.abs(pts(group[group.length-1])+Number(group[group.length-1].duration_time)-b.time)>2e-5)
      throw new Error('独立したGOP区間として扱えない時刻構造です。');
    for(let j=0;j<group.length-1;j++)if(Math.abs(pts(group[j])+Number(group[j].duration_time)-pts(group[j+1]))>2e-5)throw new Error('映像時刻が不連続です。');
    gops.push(Object.freeze({index:i,start:a.time,end:b.time,frameCount:group.length}));
  }
  const as=audio.streams?.[0];
  const analysis=Object.freeze({fileName:file.name,duration,width:stream.width??0,height:stream.height??0,
    audio:as?Object.freeze({codec:as.codec_name,sampleRate:as.sample_rate?Number(as.sample_rate):undefined}):null,gops:Object.freeze(gops)});
  return {analysis,packets};
}
