import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {GopTimeline} from '../../src/components/GopTimeline';
import type {Mp4Analysis} from '../../src/media';
import '../../src/style.css';
const a:Mp4Analysis={fileName:'test.webm',duration:6,width:320,height:180,audio:null,gops:Array.from({length:6},(_,index)=>({index,start:index,end:index+1,frameCount:10}))};
function Harness(){const [time,setTime]=useState(0);return <main style={{paddingTop:200}}><video data-testid="main-video" src="/tests/fixtures/thumbnail-test.webm" muted style={{width:320,height:180}}/><GopTimeline previewURL="/tests/fixtures/thumbnail-test.webm" analysis={a} range={{firstGop:0,lastGop:5,start:0,end:6,duration:6,frameCount:60}} currentTime={time} disabled={false} onSeek={setTime} onIn={()=>{}} onOut={()=>{}}/></main>;}
createRoot(document.getElementById('root')!).render(<Harness/>);
