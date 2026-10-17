# Third-party notices

このサンプルは次のパッケージを使用します。正確な依存バージョンはpackage-lock.jsonに固定しています。

- @ffmpeg/ffmpeg 0.12.15: MIT。https://github.com/ffmpegwasm/ffmpeg.wasm
- @ffmpeg/core 0.12.10: FFmpegと組み込みライブラリのライセンスが適用されます。標準コアはGPL機能を含む構成です。映像をコピーするだけでも、配信するバイナリのライセンス条件は変わりません。
- React / React DOM: MIT。https://github.com/facebook/react
- Vite: MIT。https://github.com/vitejs/vite
- TypeScript: Apache-2.0。https://github.com/microsoft/TypeScript
- tsx: MIT。https://github.com/privatenumber/tsx
- Playwright（検証用）: Apache-2.0。https://github.com/microsoft/playwright

参考：

- https://ffmpegwasm.netlify.app/docs/faq/#what-is-the-license-of-ffmpegwasm
- https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10
- https://ffmpeg.org/legal.html

このZIPは実装ソースとテスト素材の配布です。依存のWASMバイナリはnpm取得後にローカルでコピーします。
本サンプルのソースやライセンス表示だけで、将来のアプリ配布に必要なFFmpegのソース提供などの全条件を満たすものではありません。
実配布するビルドに対応したFFmpeg・外部ライブラリ・変更・ビルド手順などを揃え、GPL/LGPLの適用範囲と再リンク・差し替え等の条件を確認してください。
標準コアを採用するか、必要機能のみのLGPLビルドへ差し替えるかは、製品化時に選択してください。
コーデック特許はソフトウェアの著作権ライセンスとは別に確認してください。
