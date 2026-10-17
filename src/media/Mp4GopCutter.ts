import { FFmpeg } from '@ffmpeg/ffmpeg';
import { buildAnalysis, pts, type Packet, type ProbeResult } from './analysis';
import { resolveGopRange } from './gop';
import type { CutPoints, CutResult, EngineOptions, Mp4Analysis } from './types';
/** One engine owns one loaded file. No React or DOM dependency (except browser File/Blob). */
export class Mp4GopCutter {
  private ffmpeg=new FFmpeg();
  private current?:{analysis:Mp4Analysis;file:File;packets:Packet[]};
  private busy=false;
  private stopped=false;
  constructor(private options:EngineOptions={}) { this.ffmpeg.on('log',({message})=>this.options.onLog?.(message)); }
  private async exclusive<T>(operation:()=>Promise<T>):Promise<T> {
    if(this.stopped)throw new Error('破棄済みのエンジンです。新しく作成してください。');
    if(this.busy)throw new Error('別の処理が実行中です。');
    this.busy=true;try{return await operation();}finally{this.busy=false;}
  }
  private status(message:string){this.options.onStatus?.(message);}
  private async load() {
    if(this.ffmpeg.loaded)return;
    this.status('FFmpeg WASMを読み込んでいます…');
    await this.ffmpeg.load({coreURL:this.options.coreURL??new URL('/ffmpeg/ffmpeg-core.js',location.origin).href,
      wasmURL:this.options.wasmURL??new URL('/ffmpeg/ffmpeg-core.wasm',location.origin).href});
  }
  private async exec(args:string[]) {
    const code=await this.ffmpeg.exec(args);
    if(code!==0)throw new Error(`FFmpegの処理に失敗しました（終了コード ${code}）。ログをご確認ください。`);
  }
  private async remove(...names:string[]) { for(const name of names)try{await this.ffmpeg.deleteFile(name);}catch{/* missing after failed operation */} }
  private async probe(path:string,selector:string,packets:boolean):Promise<ProbeResult> {
    const args=['-v','error','-select_streams',selector,'-show_streams','-show_format'];
    if(packets)args.push('-show_packets');
    args.push('-show_entries','stream=codec_name,codec_tag_string,nal_length_size,width,height,start_time,sample_rate:format=start_time:packet=pts_time,dts_time,duration_time,pos,size,flags','-of','json',path,'-o','probe.json');
    try {
      const code=await this.ffmpeg.ffprobe(args);
      // core 0.12.10 can return -1 after a successful ffprobe. Require a complete JSON result.
      if(code!==0&&code!==-1)throw new Error(`MP4の解析に失敗しました（${code}）。`);
      const text=await this.ffmpeg.readFile('probe.json','utf8') as string;
      const result=JSON.parse(text) as ProbeResult;
      if(!Array.isArray(result.streams)||!result.format||(packets&&selector==='v:0'&&!Array.isArray(result.packets)))throw new Error('FFprobeの解析結果が不完全です。');
      return result;
    }finally{await this.remove('probe.json');}
  }
  async analyzeMp4(file:File):Promise<Mp4Analysis> {
    return this.exclusive(async()=>{
      const limit=this.options.maxInputBytes??256*1024*1024;
      if(!file.size||file.size>limit)throw new Error(`入力は0超〜${Math.floor(limit/1024/1024)}MiBに制限しています。`);
      await this.load();this.current=undefined;await this.remove('input.mp4');
      try {
        this.status('MP4を読み込んでいます…');await this.ffmpeg.writeFile('input.mp4',new Uint8Array(await file.arrayBuffer()));
        this.status('映像構造とIDR / GOPを解析しています…');
        const video=await this.probe('input.mp4','v:0',true),audio=await this.probe('input.mp4','a:0',false);
        const {analysis,packets}=await buildAnalysis(file,video,audio);this.current={analysis,file,packets};
        this.status(`解析完了：${analysis.gops.length} GOP`);return analysis;
      }catch(error){await this.remove('input.mp4');throw error;}
    });
  }
  /** Requested times are points to include. OUT at an exact boundary includes the following GOP. */
  async cutMp4(analysis:Mp4Analysis,points:CutPoints):Promise<CutResult> {
    return this.exclusive(async()=>{
      const current=this.current;if(!current||current.analysis!==analysis)throw new Error('このエンジンで現在読み込んでいる解析結果を渡してください。');
      const range=resolveGopRange(analysis,points),start=range.start.toFixed(9),duration=range.duration.toFixed(9);
      const base=['-hide_banner','-loglevel','error'];
      try {
        this.status('映像をGOP単位でコピーしています…');
        await this.exec([...base,'-ss',start,'-i','input.mp4','-map','0:v:0','-an','-frames:v',String(range.frameCount),'-c:v','copy','video.mp4']);
        if(analysis.audio) {
          this.status('音声を映像区間に合わせてAACエンコードしています…');
          await this.exec([...base,'-ss',start,'-i','input.mp4','-map','0:a:0','-vn','-af',`atrim=start=0:end=${duration},apad=whole_dur=${duration},atrim=end=${duration}`,'-c:a','aac','-b:a','192k','audio.m4a']);
          await this.exec([...base,'-i','video.mp4','-i','audio.m4a','-map','0:v:0','-map','1:a:0','-c','copy','-movflags','+faststart','output.mp4']);
        }else await this.exec([...base,'-i','video.mp4','-map','0:v:0','-an','-c:v','copy','-movflags','+faststart','output.mp4']);
        const output=await this.ffmpeg.readFile('output.mp4');if(typeof output==='string')throw new Error('出力がバイナリではありません。');
        const bytes=new Uint8Array(output.length);bytes.set(output);
        const blob=new Blob([bytes.buffer],{type:'video/mp4'});
        this.status('出力映像のデータと時刻を検証しています…');
        const result=await this.probe('output.mp4','v:0',true),exported=result.packets??[];
        const firstPacket=analysis.gops.slice(0,range.firstGop).reduce((n,g)=>n+g.frameCount,0);
        const selected=current.packets.slice(firstPacket,firstPacket+range.frameCount);
        if(exported.length!==selected.length)throw new Error('出力映像のフレーム数が一致しません。');
        for(let i=0;i<selected.length;i++) {
          if(Math.abs(pts(selected[i])-range.start-pts(exported[i]))>3e-5)throw new Error('出力映像の表示時刻が一致しません。');
          const a=await this.packetHash(current.file,selected[i]),b=await this.packetHash(blob,exported[i]);
          if(a!==b)throw new Error('出力映像の圧縮データが元と一致しません。');
        }
        const audioOut=await this.probe('output.mp4','a:0',false);
        if(Boolean(audioOut.streams?.length)!==Boolean(analysis.audio))throw new Error('音声トラックの有無が一致しません。');
        this.status('書き出しと映像の一致検証が完了しました。');
        return {blob,fileName:analysis.fileName.replace(/\.mp4$/i,'')+'-clip.mp4',range,videoVerified:true,hasAudio:!!analysis.audio};
      }finally{await this.remove('video.mp4','audio.m4a','output.mp4');}
    });
  }
  private async packetHash(blob:Blob,p:Packet) {
    const bytes=await blob.slice(Number(p.pos),Number(p.pos)+Number(p.size)).arrayBuffer();
    const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
  }
  /** Optional browser-compatible preview for non-AAC inputs; export still uses the original input. */
  async createPreview(analysis:Mp4Analysis):Promise<Blob> {
    return this.exclusive(async()=>{
      if(this.current?.analysis!==analysis)throw new Error('現在の解析結果を渡してください。');
      if(!analysis.audio||analysis.audio.codec==='aac')return this.current.file;
      try {
        this.status('プレビュー用の音声をAACに変換しています…');
        await this.exec(['-hide_banner','-loglevel','error','-i','input.mp4','-map','0:v:0','-map','0:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart','preview.mp4']);
        const data=await this.ffmpeg.readFile('preview.mp4');if(typeof data==='string')throw new Error('プレビュー取得に失敗しました。');
        const bytes=new Uint8Array(data.length);bytes.set(data);return new Blob([bytes.buffer],{type:'video/mp4'});
      }finally{await this.remove('preview.mp4');}
    });
  }
  /** Cancels any running worker operation and releases input/WASM memory. */
  dispose(){this.stopped=true;this.current=undefined;this.ffmpeg.terminate();}
}
