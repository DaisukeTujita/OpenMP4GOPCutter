import {useCallback,useEffect,useRef,useState} from 'react';
import {VideoThumbnailExtractor,type VideoThumbnail} from './VideoThumbnailExtractor';
interface State {thumbnail:VideoThumbnail|null;loading:boolean;error:string|null}
const empty:State={thumbnail:null,loading:false,error:null};
/** Coalesces pointer requests, runs only one seek at once, discards obsolete responses. */
export function useVideoThumbnail(sourceURL:string, enabled=true) {
  const [state,setState]=useState<State>(empty);
  const extractor=useRef<VideoThumbnailExtractor|null>(null),epoch=useRef(0),latest=useRef(0),pending=useRef<{time:number;id:number}|null>(null),running=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{
    const generation=++epoch.current;latest.current++;pending.current=null;running.current=false;setState(empty);
    if(timer.current)clearTimeout(timer.current);
    const service=sourceURL&&enabled?new VideoThumbnailExtractor(sourceURL):null;extractor.current=service;
    return()=>{if(epoch.current===generation){epoch.current++;latest.current++;pending.current=null;if(timer.current)clearTimeout(timer.current);extractor.current=null;}service?.dispose();};
  },[sourceURL,enabled]);
  const pump=useCallback(async()=>{
    const service=extractor.current,generation=epoch.current;
    if(!service||running.current)return;
    running.current=true;
    try{
      while(pending.current&&epoch.current===generation){
        const request=pending.current;pending.current=null;
        try{const thumbnail=await service.getThumbnail(request.time);if(epoch.current===generation&&request.id===latest.current)setState({thumbnail,loading:false,error:null});}
        catch(error){if(epoch.current===generation&&request.id===latest.current)setState({thumbnail:null,loading:false,error:error instanceof Error?error.message:String(error)});}
      }
    }finally{if(epoch.current===generation)running.current=false;}
  },[]);
  const request=useCallback((time:number)=>{
    const service=extractor.current;if(!service)return;
    const id=++latest.current,cached=service.peek(time);
    if(cached){pending.current=null;setState({thumbnail:cached,loading:false,error:null});return;}
    pending.current={time,id};setState({thumbnail:null,loading:true,error:null});
    if(timer.current)clearTimeout(timer.current);
    timer.current=setTimeout(()=>{void pump();},80);
  },[pump]);
  const clear=useCallback(()=>{latest.current++;pending.current=null;if(timer.current)clearTimeout(timer.current);setState(empty);},[]);
  return {...state,request,clear};
}
