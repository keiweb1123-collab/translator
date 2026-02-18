// DOM要素
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const listeningStatus = document.getElementById('listeningStatus');
const translationDisplay = document.getElementById('translationDisplay');
const currentSpeechEl = document.getElementById('currentSpeech');
const notificationArea = document.getElementById('notificationArea');

// 状態
let recognition = null;
let isRunning = false;
let debounceTimer = null;

// 音声認識のセットアップ
function setupRecognition() {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('このブラウザは音声認識に対応していません。Chromeを使ってください。');
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'id-ID'; // インドネシア語
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = function () {
        listeningStatus.textContent = 'マイク: 聞き取り中...';
        listeningStatus.style.color = '#0f0';
        startBtn.disabled = true;
        stopBtn.disabled = false;
        isRunning = true;
    };

    recognition.onend = function () {
        listeningStatus.textContent = 'マイク: 停止中';
        listeningStatus.style.color = '#aaa';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        isRunning = false;
    };

    recognition.onresult = function (event) {
        var interimTranscript = '';
        var finalTranscript = '';

        for (var i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        // プレビュー表示
        currentSpeechEl.textContent = finalTranscript || interimTranscript || '...';

        // 確定テキストがあれば即座に翻訳
        if (finalTranscript.trim()) {
            translateWithMyMemory(finalTranscript.trim());
        }
        // 途中経過が1秒変化なければプレビュー翻訳
        else if (interimTranscript.trim()) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () {
                translateWithMyMemory(interimTranscript.trim(), true);
            }, 1000);
        }
    };

    recognition.onerror = function (event) {
        console.error('音声認識エラー:', event.error);
    };
}

// MyMemory APIで翻訳
function translateWithMyMemory(text, isPreview) {
    // MyMemory API: 無料、APIキー不要
    var url = 'https://api.mymemory.translated.net/get?q='
        + encodeURIComponent(text)
        + '&langpair=id|en';

    fetch(url)
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.responseStatus === 200 && data.responseData) {
                var translated = data.responseData.translatedText;

                if (isPreview) {
                    // プレビュー（薄く表示、履歴に残さない）
                    updatePreview(translated);
                } else {
                    // 確定翻訳（履歴に追加）
                    clearPreview();
                    addTranslation(translated, text);
                }
            }
        })
        .catch(function (err) {
            console.error('翻訳エラー:', err);
        });
}

// 翻訳結果を画面に追加
function addTranslation(english, indonesian) {
    // プレースホルダーがあれば消す
    var placeholder = document.querySelector('.placeholder-text');
    if (placeholder) placeholder.remove();

    // 過去のアイテムを薄くする
    var items = document.querySelectorAll('.translation-item');
    for (var i = 0; i < items.length; i++) {
        items[i].classList.add('history');
    }

    // 新しい翻訳アイテムを作成
    var item = document.createElement('div');
    item.className = 'translation-item';

    var enDiv = document.createElement('div');
    enDiv.className = 'translation-en';
    enDiv.textContent = english;

    var idDiv = document.createElement('div');
    idDiv.className = 'translation-id';
    idDiv.textContent = '🇮🇩 ' + indonesian;

    item.appendChild(enDiv);
    item.appendChild(idDiv);
    translationDisplay.appendChild(item);

    // 下にスクロール
    window.scrollTo(0, document.body.scrollHeight);
}

// プレビュー表示
function updatePreview(text) {
    var previewEl = document.getElementById('previewTranslation');
    if (!previewEl) {
        previewEl = document.createElement('div');
        previewEl.id = 'previewTranslation';
        previewEl.style.color = '#666';
        previewEl.style.fontStyle = 'italic';
        previewEl.style.fontSize = '1.2rem';
        previewEl.style.padding = '10px 0';
        translationDisplay.appendChild(previewEl);
    }
    previewEl.textContent = '(Preview) ' + text;
    window.scrollTo(0, document.body.scrollHeight);
}

function clearPreview() {
    var previewEl = document.getElementById('previewTranslation');
    if (previewEl) previewEl.remove();
}

// 通知表示
function showNotification(message, type) {
    notificationArea.textContent = message;
    notificationArea.className = 'notification ' + type;
    setTimeout(function () {
        notificationArea.className = 'notification hidden';
    }, 3000);
}

// ボタンイベント
startBtn.addEventListener('click', function () {
    if (!recognition) setupRecognition();
    try {
        recognition.start();
    } catch (e) {
        console.error(e);
    }
});

stopBtn.addEventListener('click', function () {
    if (recognition) recognition.stop();
});

// 初期化
setupRecognition();
