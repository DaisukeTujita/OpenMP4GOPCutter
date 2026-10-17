# MP4 GOP Cutter — ffmpeg.wasm / React版

Python・ネイティブFFmpegを使わず、ブラウザ内でMP4を解析・切り出すサンプルです。
React画面と処理モジュールを分離しています。動画をアップロードするAPIはありません。

## 起動

Node.js 22.12以降（Node 24推奨）で、展開先のコマンドプロンプトから：

```bat
npm ci
npm run dev
```

表示されたURL（通常 http://127.0.0.1:5173 ）をブラウザで開きます。
`start.bat` でも起動できます。最初の依存パッケージ取得にはネット接続が必要です。
Python、ffmpeg.exe、ffprobe.exeは不要です。

`npm run dev` / `npm run build` が、npmで取得したWASMを `public/ffmpeg` にコピーします。
処理時に外部CDNからWASMを取得しません。依存パッケージ取得後は外部サービスなしで利用できます。
本番配置は `npm run build` の `dist` を静的Webサーバーへ配置してください。
file:// でHTMLを直接開く構成ではありません。localhostまたはHTTPSで利用してください（SHA-256検証でWeb Cryptoを使います）。

## IN / OUTの仕様

GOPは半開区間 `[start, end)` です。指定した時刻を**含む**GOPを選びます。

| 操作 | 選択する境界 |
| --- | --- |
| 現在位置 → IN | その位置を含むGOPの先頭 |
| 現在位置 → OUT | その位置を含むGOPの終了 |

1秒ごとにGOPがある例：

- IN指定1.8秒 → 実際のINは1秒。
- OUT指定2.3秒 → 実際のOUT境界は3秒。
- OUT指定2.000秒ちょうど → 2秒から始まるGOPを含め、終了境界は3秒。
- INとOUTに同じ位置を指定 → その位置を含む1つのGOPを出力。
- EOFはOUT指定にのみ使用可。INには使用不可。

画面のOUTドロップダウンは「最後に含めるGOP」を選びます。OUTフレームや終了境界を直接選ぶものではありません。
INがOUTより後に変更されたときはOUTも同じ指定点へ、OUTがINより前に変更されたときはINも同じ指定点へ合わせます。
動画のプレビュー位置は自由にシークできます。切り出し区間だけGOP単位になります。

## 組み込み用API

`src/media/` を既存Reactプロジェクトへコピーし、`@ffmpeg/ffmpeg` と `@ffmpeg/core` を依存に追加します。
公開入口は `src/media/index.ts` です。

```ts
import { Mp4GopCutter, resolveGopRange } from './media';

const cutter = new Mp4GopCutter({
  coreURL: '/ffmpeg/ffmpeg-core.js',
  wasmURL: '/ffmpeg/ffmpeg-core.wasm',
  onStatus: (message) => console.log(message),
  onLog: (message) => console.debug(message),
});

// 1. ユーザーが選択したFileを解析 → GOP一覧
const analysis = await cutter.analyzeMp4(file);
console.table(analysis.gops);
// [{index, start, end, frameCount}, ...] 時刻の単位は秒

// 2. 含めたい2点から実際のGOP範囲を計算（WASM実行なし）
const points = { inSeconds: 1.8, outSeconds: 2.3 };
const range = resolveGopRange(analysis, points);
// 1秒GOPなら start=1, end=3, frameCount=60

// 3. 同じ指定点を渡して切り出し
const result = await cutter.cutMp4(analysis, points);
const url = URL.createObjectURL(result.blob);
// <a href={url} download={result.fileName}>保存</a>
// result.range: 実際の出力区間
// result.videoVerified: 圧縮映像データ・表示時刻の検証結果
// 使用後 URL.revokeObjectURL(url)

// 4. 使用終了 / アンマウント / 処理中止
cutter.dispose();
```

**`cutMp4` のOUT引数は「含めたい位置」です。`range.end`という除外境界を再度OUTとして渡すと、その次のGOPまで含めることになります。上の例のように元の`points`を渡してください。**

GOP番号で選択済みなら、INには最初のGOPの`start`、OUTには最後に含めたいGOPの`start`を渡せます。

```ts
await cutter.cutMp4(analysis, {
  inSeconds: analysis.gops[firstIndex].start,
  outSeconds: analysis.gops[lastIndex].start,
});
```

他の公開関数：

- `findGopAtTime(gops, seconds)` → 指定点を含むGOP
- `snapIn(gops, seconds)` → そのGOPの先頭時刻
- `snapOut(gops, seconds)` → そのGOPの終了時刻（EOFも可）
- `cutter.createPreview(analysis)` → プレビュー用Blob。非AAC音声の場合だけ音声をAAC変換。映像はコピー。書き出しは常に元入力を使用。

## Reactへの組み込み

実例は `src/App.tsx` を参照してください。`useEffect`でエンジンを生成し、cleanupで破棄する構成です。

```tsx
const cutterRef = useRef<Mp4GopCutter | null>(null);
useEffect(() => {
  const cutter = new Mp4GopCutter({ onStatus: setStatus });
  cutterRef.current = cutter;
  return () => {
    cutterRef.current = null;
    cutter.dispose();
  };
}, []);
```

- エンジンは1ファイルを保持。別ファイルの解析が始まると以前の解析結果は無効です。
- 解析結果は同じインスタンスから返されたオブジェクトをそのまま渡します。JSON保存・複製した結果では切り出せません。
- 同時実行はエラーにします。UIで解析・書き出し中の操作を無効にしてください。
- `dispose()`は実行中のWorkerも終了。再利用する場合は新しいインスタンスを作成します。
- イベントコールバックは、処理を妨げないよう例外を投げない実装にしてください。
- `onStatus`は工程表示。FFmpegの複数工程を単一の進捗率に換算していません。
- Next.jsではブラウザ専用モジュールです。Client Componentから使用し、必要に応じて`useEffect`内で動的importしてください。Workerのバンドル方法は利用するビルド環境に合わせて検証してください。

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| src/media/Mp4GopCutter.ts | WASM実行、解析・切り出し・プレビュー・検証・破棄 |
| src/media/analysis.ts | FFprobe結果からIDRを確認しGOP一覧を作成 |
| src/media/gop.ts | 時刻→GOP検索、IN / OUTスナップ、区間計算（副作用なし） |
| src/media/types.ts | 公開型 |
| src/components/GopTimeline.tsx | 自作シークバー |
| src/App.tsx | ReactプレイヤーとAPI利用例 |
| scripts/copy-assets.mjs | npmからWASMを同一オリジン配信用にコピー |

## 内部処理

1. ffmpeg.wasmのFFprobeでパケット時刻・格納位置と音声トラックの有無・形式を取得。
2. キーフレーム候補のH.264パケットを元Fileから読み、NAL unit type 5（IDR）を確認。
3. GOP内の表示時刻の連続性を検証。Open GOPの通常のIフレームは境界にしない。
4. 選択GOP間の映像を `-c:v copy -frames:v N` でコピー。Bフレーム対策として時刻だけでなくフレーム数を制限。
5. 音声があれば指定区間をデコードしてAAC 192kbpsへ再エンコード。短い音声の末尾には無音を補完。
6. 映像・音声をMP4へ再格納。音声なしなら音声トラックを作らない。
7. 出力映像の全パケットを元入力とSHA-256比較し、フレーム数・表示時刻・音声の有無も確認。一致しなければ結果を返さない。
8. 一時ファイルをWASMのメモリ上から削除。入力は別ファイルを解析するかdisposeするまで保持。

## 対象と制限

- 非暗号化のavc1 H.264 MP4。最初の映像・最初の音声のみ。
- 映像・コンテナの開始時刻0、先頭がIDR、表示時刻が連続する素材に限定。
- 入力音声はAAC・MP3・AC-3でテスト。それ以外はコアがデコードできれば処理可能ですが未検証。
- Open GOPで途中のIDRがなければ、途中の境界も表示されません。
- 音声境界、波形、無音検出、素材タイムコード、正確なフレーム送りは未実装。
- 音声のAAC遅延・パディングはFFmpegのMP4処理に任せています。利用するプレイヤーで同期・終端を確認してください。
- 初期入力上限256MiB。MEMFSに入力・出力を保持するため、ファイルサイズ以上のメモリを使います。大容量・長尺向けストリーミング処理ではありません。
- `maxInputBytes`で上限は変更できますが、ブラウザ・WASMのメモリ制約がなくなるわけではありません。
- シングルスレッドコアなのでSharedArrayBuffer / COOP / COEPは不要。Web Worker・WebAssembly・Web Cryptoが使える環境が必要です。
- 複雑な編集リスト、特殊な参照構造、非対応の映像プロファイルなどは対象外です。
- 動画ファイルはサーバーに送信しません。Node / Viteは静的ファイル配信と開発ビルドだけを担当します。

## 付属素材

`public/samples` 内のMP4をそのまま選択でき、画面にも読み込みボタンがあります。

| ファイル | 長さ | 映像 | 音声 |
| --- | --- | --- | --- |
| h264_aac.mp4 | 6秒 | 640×360 / 30fps / 1秒IDR | AAC |
| h264_no_audio.mp4 | 6秒 | 同上 | なし |
| h264_mp3.mp4 | 6秒 | 同上 | MP3 |
| h264_ac3.mp4 | 6秒 | 同上 | AC-3 |
| h264_ntsc.mp4 | 約12秒 | 640×360 / 29.97fps / 2.002秒IDR | AAC |

動くテストパターン、音声ありの素材はテスト音です。すべてBフレームあり。

## 検証コマンド

```bat
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Playwrightは開発検証用であり、アプリ利用時には不要です。

## ライセンス

自作サンプルコードはMIT。依存ライブラリのライセンスは別です。
`THIRD_PARTY_NOTICES.md`を参照してください。標準の`@ffmpeg/core`をLGPL専用構成とみなすことはできません。
このZIPにはFFmpegコアのコンパイル済みWASM、生成済みdist、node_modulesを含めていません。
商用配布・Web公開時には、実際に配信するコアと組み込みライブラリの対応ソース提供などを整備してください。

## 実施済みの検証結果

- 単体テスト7件：前後方向へのスナップ、境界ちょうどのOUT、同一点、EOF、29.97fpsの小数時刻、不正範囲、IDR判定。
- 既存のChromium上でffmpeg.wasmを実行するブラウザテスト6件：React操作・ダウンロード、および5素材の解析・書き出し・元映像との一致・音声有無・繰り返し書き出し・プレビュー変換・古い解析結果の拒否。
- 本番ビルドおよびTypeScript型チェック。
- 書き出した5素材＋UI出力をネイティブFFmpegで再デコードして検証。ネイティブFFmpegはこの検証だけに使用し、アプリの実行には不要です。
- Windows / Edge実機での再生確認は未実施です。検証用Chromiumでは標準videoタグのH.264プレビュー再生を確認できていません。WASMの処理とUI操作の検証とは区別しています。

FFprobeのcore 0.12.10には、正常なJSON出力でも終了値が-1になる既知の事象があります。
この実装では0または-1の場合に限り、毎回新規に生成したJSONの構文・構造を検証してから使用します。
https://github.com/ffmpegwasm/ffmpeg.wasm/issues/817

## タイムラインのサムネイル（video + canvas）

シークバーにマウスを重ねるかドラッグすると、その位置の画像と時刻をツールチップで表示します。
再生用とは別の非表示videoをシークし、シーク完了後にcanvasへ描画します。この機能はFFmpegを呼びません。
ホバーだけでは本体の再生位置を変えません。中央をドラッグする場合は、通常のスクラブ操作として本体もシークします。

- ポインター移動の取得要求は80msの待機でまとめ、処理中なら最新の要求だけを待機させます。
- 画像は0.2秒単位の位置で取得し、最大80枚をキャッシュします。
- ツールチップの大きい時刻はマウス位置、小さい「画像：約…」は取得した画像の時刻です。厳密なフレーム指定の機能ではありません。
- 古い位置の画像を最新の時刻に対応する画像として表示しません。取得中は「取得中…」を表示します。
- 音声再生はせず、別videoは常にミュートです。
- マウスが離れたとき、スクロール・サイズ変更時、入力変更時、書き出し中はツールチップを非表示にします。
- 非AAC音声の入力では、既存のAACプレビュー用MP4を画像取得にも使います。サムネイル専用の再エンコードはしません。

単独の取得クラスとReactフックを `src/thumbnails/` に分離しています。

```ts
import { VideoThumbnailExtractor } from './thumbnails';

const url = URL.createObjectURL(file);
const extractor = new VideoThumbnailExtractor(url, {
  width: 192,
  interval: 0.2,
  cacheSize: 80,
  timeoutMs: 8000,
});
try {
  const thumbnail = await extractor.getThumbnail(12.3);
  // thumbnail.dataUrl → <img src={...}>
  // thumbnail.time → シークして取得した画像の時刻（秒）
} finally {
  extractor.dispose();
  URL.revokeObjectURL(url);
}
```

Reactでは `useVideoThumbnail(previewURL, enabled)` が `request(time)` / `clear()` と、`thumbnail` / `loading` / `error` を返します。
マウス座標から秒を求めて `request(time)` を呼び、取得結果をimgへ渡します。実例は `GopTimeline.tsx` を参照してください。
別のプレイヤーへ移す場合は `src/media` に加えて `src/thumbnails` もコピーします。

ブラウザがvideoタグでデコードできる形式が対象です。非対応なら画像の代わりにメッセージを表示し、切り出し処理は引き続き利用できます。
外部URLを取得クラスへ渡す場合は、必要に応じて `crossOrigin: 'anonymous'` を指定し、配信元も適切なCORS応答を返す必要があります。付属画面はローカルBlob URLを使います。
このモジュールもブラウザ専用です。SSR中にはインスタンスを生成しないでください。

追加したブラウザテスト3件では、動画の異なる位置から実画像が取れること、キャッシュ、本体位置の維持、ポインター移動・ドラッグ時の表示、離脱時の非表示、破棄時の中断を確認します。
検証用ChromiumのH.264対応の制限を避けるため、画像取得テスト専用のVP9 WebM（`tests/fixtures/thumbnail-test.webm`）を使用しています。
H.264 MP4の画像取得は対象のWindows / Edge実機で確認してください。

サムネイル追加後：単体テスト7件・ブラウザテスト計9件・本番ビルドが成功しました。
