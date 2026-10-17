export interface VideoThumbnail { dataUrl: string; time: number; width: number; height: number }
export interface ThumbnailOptions { width?: number; interval?: number; cacheSize?: number; timeoutMs?: number; crossOrigin?: 'anonymous' | 'use-credentials' }
/** Independent hidden video + canvas. Never seeks the playback video; never invokes FFmpeg. */
export class VideoThumbnailExtractor {
  private video: HTMLVideoElement;
  private canvas = document.createElement('canvas');
  private abort = new AbortController();
  private cache = new Map<number, VideoThumbnail>();
  private queue: Promise<unknown> = Promise.resolve();
  private ready: Promise<void>;
  constructor(sourceURL: string, private options: ThumbnailOptions = {}) {
    for(const value of [options.width,options.interval,options.cacheSize,options.timeoutMs])if(value!==undefined&&(!Number.isFinite(value)||value<=0))throw new Error('サムネイル設定には正の有限値を指定してください。');
    const video = this.video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    if(options.crossOrigin) video.crossOrigin = options.crossOrigin;
    this.ready = this.wait('loadedmetadata', () => video.readyState >= 1);
    // Avoid an unhandled rejection if the source is unsupported before the first hover.
    void this.ready.catch(() => {});
    video.src = sourceURL; video.load();
  }
  private wait(event: string, satisfied: () => boolean): Promise<void> {
    if(this.abort.signal.aborted) return Promise.reject(new Error('サムネイル取得は終了しました。'));
    if(satisfied()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const video = this.video;
      const cleanup = () => { clearTimeout(timer); video.removeEventListener(event, success); video.removeEventListener('error', failure); this.abort.signal.removeEventListener('abort', cancelled); };
      const success = () => { if(satisfied()){ cleanup(); resolve(); } };
      const failure = () => { cleanup(); reject(new Error('このブラウザではサムネイルを取得できません。')); };
      const cancelled = () => { cleanup(); reject(new Error('サムネイル取得は終了しました。')); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('サムネイル取得がタイムアウトしました。')); }, this.options.timeoutMs ?? 8000);
      video.addEventListener(event, success); video.addEventListener('error', failure); this.abort.signal.addEventListener('abort', cancelled, { once: true });
      if(video.error) failure();
    });
  }
  private key(time:number){return Math.floor(Math.max(0,time)/(this.options.interval ?? .2));}
  peek(time:number):VideoThumbnail | undefined { return this.cache.get(this.key(time)); }
  getThumbnail(time: number): Promise<VideoThumbnail> {
    if(!Number.isFinite(time)||time<0)return Promise.reject(new Error('取得時刻は0以上の有限値を指定してください。'));
    const task = this.queue.then(() => this.capture(time));
    this.queue = task.catch(() => {});
    return task;
  }
  private async capture(time:number):Promise<VideoThumbnail> {
    await this.ready;
    if(this.abort.signal.aborted)throw new Error('サムネイル取得は終了しました。');
    const key = this.key(time), cached = this.cache.get(key);
    if(cached){this.cache.delete(key);this.cache.set(key,cached);return cached;}
    const video=this.video;
    if(!Number.isFinite(video.duration)||video.duration<=0)throw new Error('動画の長さを取得できません。');
    const target=Math.min(key*(this.options.interval??.2),Math.max(0,video.duration-.001));
    if(Math.abs(video.currentTime-target)>.00001 || video.readyState<2) {
      // Install listener before currentTime is changed; only draw after seek completion.
      const sought=this.wait('seeked',()=>!video.seeking&&Math.abs(video.currentTime-target)<.002&&video.readyState>=2);
      video.currentTime=target;
      await sought;
    }
    if(video.readyState<2)await this.wait('loadeddata',()=>video.readyState>=2);
    if(this.abort.signal.aborted)throw new Error('サムネイル取得は終了しました。');
    const width=Math.min(this.options.width??192,video.videoWidth),height=Math.max(1,Math.round(width*video.videoHeight/video.videoWidth));
    if(!width||!Number.isFinite(height))throw new Error('動画の画像サイズを取得できません。');
    this.canvas.width=width;this.canvas.height=height;
    const ctx=this.canvas.getContext('2d');if(!ctx)throw new Error('Canvasを初期化できません。');
    ctx.drawImage(video,0,0,width,height);
    let dataUrl:string;
    try{dataUrl=this.canvas.toDataURL('image/jpeg',.75);}catch{throw new Error('画像を取得できません。別ドメインの動画はCORS設定を確認してください。');}
    const result={dataUrl,time:video.currentTime,width,height};
    this.cache.set(key,result);
    while(this.cache.size>(this.options.cacheSize??80))this.cache.delete(this.cache.keys().next().value!);
    return result;
  }
  dispose(){this.abort.abort();this.video.pause();this.video.removeAttribute('src');this.video.load();this.cache.clear();this.canvas.width=0;this.canvas.height=0;}
}
