import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.0';

// ローカル実行のため、WASMファイルのパスなどを調整
// CDNから直接読み込むのでデフォルト設定でOKだが、必要なら設定
env.allowLocalModels = false; // CDNからモデルを取得する設定

// DOM要素
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const listeningStatus = document.getElementById('listeningStatus');
const aiStatus = document.getElementById('aiStatus');
const translationDisplay = document.getElementById('translationDisplay');
const currentSpeechEl = document.getElementById('currentSpeech');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
const debugLog = document.getElementById('debugLog');

// 状態管理
let recognition = null;
let translator = null;
let isTranslating = false;
let transcriptBuffer = '';
let interimDebounceTimer = null;

// 定数
// モデル名: MetaのNLLB (No Language Left Behind) の軽量版
// インドネシア語(ind_Latn) -> 英語(eng_Latn)
const MODEL_NAME = 'Xenova/nllb-200-distilled-600M';

// デバッグログ出力
function log(msg) {
    if (debugLog) {
        const time = new Date().toLocaleTimeString();
        debugLog.innerHTML += `[${time}] ${msg}<br>`;
        debugLog.scrollTop = debugLog.scrollHeight;
    }
    console.log(msg);
}

// 初期化
async function init() {
    setupRecognition();

    // AIモデルの準備開始をユーザーに促すため、ボタンを有効化
    // (クリックしてからダウンロード開始にする)
    startBtn.disabled = false;
    startBtn.textContent = "翻訳開始 (初回は遅いです)";
}

// 翻訳パイプラインのロード
async function loadTranslator() {
    if (translator) return true; // 既にロード済み

    try {
        startBtn.disabled = true;
        aiStatus.textContent = "AIモデル: ダウンロード中...";
        aiStatus.style.color = "orange";
        progressContainer.style.display = "block";
        log("Transformers.js: パイプライン作成開始...");

        // 翻訳パイプラインの作成
        translator = await pipeline('translation', MODEL_NAME, {
            progress_callback: (data) => {
                if (data.status === 'progress') {
                    const percent = Math.round(data.progress || 0);
                    progressBar.style.width = `${percent}%`;
                    statusText.textContent = `ダウンロード中... ${data.file} (${percent}%)`;
                    if (percent % 10 === 0) log(`DL: ${data.file} ${percent}%`);
                } else if (data.status === 'done') {
                    statusText.textContent = `準備完了: ${data.file}`;
                } else if (data.status === 'ready') {
                    // 全体の準備完了
                }
            }
        });

        log("Transformers.js: パイプライン作成完了！");
        aiStatus.textContent = "AIモデル: 準備完了 (オフライン動作中)";
        aiStatus.style.color = "#00ff00";
        progressContainer.style.display = "none";
        statusText.textContent = "";

        // プレースホルダーを更新
        const placeholder = document.querySelector('.placeholder-text');
        if (placeholder) {
            placeholder.textContent = "準備完了！マイクに向かって話してください。";
            placeholder.style.color = "#00ff00";
        }

        return true;
    } catch (error) {
        console.error("モデルロードエラー:", error);
        log(`モデルロード失敗: ${error.message}`);
        aiStatus.textContent = "エラー: モデル読み込み失敗";
        aiStatus.style.color = "red";
        alert("AIモデルの読み込みに失敗しました。ネットワーク接続を確認してリロードしてください。");
        startBtn.disabled = false;
        return false;
    }
}

// 音声認識のセットアップ
function setupRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('このブラウザは音声認識に対応していません。Chromeを使用してください。');
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'id-ID'; // インドネシア語
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
        listeningStatus.textContent = 'マイク: 聞き取り中...';
        listeningStatus.style.color = '#00ff00';
        startBtn.disabled = true;
        stopBtn.disabled = false;
    };

    recognition.onend = () => {
        listeningStatus.textContent = 'マイク: 停止中';
        listeningStatus.style.color = '#aaa';
        startBtn.disabled = false;
        stopBtn.disabled = true;
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        currentSpeechEl.textContent = finalTranscript + (interimTranscript ? ' (' + interimTranscript + ')' : '');

        // 確定時
        if (finalTranscript) {
            log(`音声認識確定: "${finalTranscript}"`);
            transcriptBuffer = finalTranscript; // 確定した分だけ翻訳
            updatePreviewDisplay(''); // プレビュー消す
            runTranslation(finalTranscript, false); // 本番翻訳
        }
        // 途中経過（ライブプレビュー）
        else if (interimTranscript.trim().length > 0) {
            // 0.3秒デバウンスでプレビュー更新
            clearTimeout(interimDebounceTimer);
            interimDebounceTimer = setTimeout(() => {
                runTranslation(interimTranscript, true); // プレビュー翻訳
            }, 300);
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        log(`音声認識エラー: ${event.error}`);
    };
}

// 翻訳実行（Transformers.js）
async function runTranslation(text, isPreview) {
    if (!text || !text.trim()) return;
    if (!translator) return;

    // プレビュー表示の更新関数
    const displayResult = (translatedText) => {
        if (isPreview) {
            updatePreviewDisplay(translatedText);
        } else {
            appendTranslation(translatedText);
        }
    };

    try {
        const startTime = performance.now();

        // 翻訳実行: インドネシア語(ind_Latn) -> 英語(eng_Latn)
        const output = await translator(text, {
            src_lang: 'ind_Latn',
            tgt_lang: 'eng_Latn'
        });

        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);

        // 結果取得
        const translatedText = output[0].translation_text;

        log(`${isPreview ? 'プレビュー' : '確定'}翻訳 (${duration}ms): ${translatedText}`);
        displayResult(translatedText);

    } catch (error) {
        console.error("翻訳エラー:", error);
        log(`翻訳エラー: ${error.message}`);
    }
}

// 画面に翻訳結果を追加
function appendTranslation(translated) {
    // 履歴を薄く
    document.querySelectorAll('.translation-item').forEach(item => item.classList.add('history'));

    const item = document.createElement('div');
    item.className = 'translation-item';
    item.textContent = translated;

    translationDisplay.appendChild(item);
    translationDisplay.scrollTop = translationDisplay.scrollHeight;
}

// プレビュー表示の更新
function updatePreviewDisplay(text) {
    let previewEl = document.getElementById('translationPreview');
    if (!previewEl) {
        previewEl = document.createElement('div');
        previewEl.id = 'translationPreview';
        previewEl.style.color = '#888';
        previewEl.style.fontStyle = 'italic';
        translationDisplay.appendChild(previewEl);
    }
    previewEl.textContent = text ? `(Preview) ${text}` : '';
    translationDisplay.scrollTop = translationDisplay.scrollHeight;
}

// ボタンイベント
startBtn.addEventListener('click', async () => {
    // 初回ならモデルロード
    const success = await loadTranslator();
    if (success) {
        recognition.start();
    }
});

stopBtn.addEventListener('click', () => {
    recognition.stop();
});

// 開始
init();
