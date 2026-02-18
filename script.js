// DOM
var startBtn = document.getElementById('startBtn');
var stopBtn = document.getElementById('stopBtn');
var statusDot = document.getElementById('statusDot');
var translationDisplay = document.getElementById('translationDisplay');
var currentSpeechEl = document.getElementById('currentSpeech');
var previewBar = document.getElementById('previewBar');
var emptyState = document.getElementById('emptyState');
var notificationArea = document.getElementById('notificationArea');

// 状態
var recognition = null;
var isRunning = false;
var buffer = '';          // 音声テキストを溜めるバッファ
var sendTimer = null;     // バッファ送信用タイマー
var BATCH_INTERVAL = 2000; // 2秒ごとにまとめて翻訳（速さ重視）

// 音声認識セットアップ
function setupRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        alert('このブラウザは音声認識に対応していません。Chromeをお使いください。');
        return;
    }

    recognition = new SR();
    recognition.lang = 'id-ID';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = function () {
        statusDot.className = 'status-dot on';
        startBtn.disabled = true;
        stopBtn.disabled = false;
        previewBar.classList.remove('hidden');
        isRunning = true;

        // 3秒ごとにバッファを送信するタイマー開始
        sendTimer = setInterval(flushBuffer, BATCH_INTERVAL);
    };

    recognition.onend = function () {
        statusDot.className = 'status-dot off';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        isRunning = false;

        clearInterval(sendTimer);
        // 残りのバッファがあれば送信
        flushBuffer();
    };

    recognition.onresult = function (event) {
        var interim = '';
        var final_text = '';

        for (var i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                final_text += event.results[i][0].transcript;
            } else {
                interim += event.results[i][0].transcript;
            }
        }

        // プレビュー表示
        currentSpeechEl.textContent = final_text || interim || '...';

        // 確定テキストをバッファに追加（まだ送信しない）
        if (final_text.trim()) {
            buffer += ' ' + final_text.trim();
        }
    };

    recognition.onerror = function (event) {
        console.error('音声認識エラー:', event.error);
    };
}

// バッファを送信して翻訳
function flushBuffer() {
    var text = buffer.trim();
    buffer = '';
    if (!text) return;
    translateWithMyMemory(text);
}

// MyMemory API
function translateWithMyMemory(text) {
    var url = 'https://api.mymemory.translated.net/get?q='
        + encodeURIComponent(text)
        + '&langpair=id|en';

    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.responseStatus === 200 && data.responseData) {
                var translated = data.responseData.translatedText;
                addCard(translated, text);
            }
        })
        .catch(function (err) {
            console.error('翻訳エラー:', err);
        });
}

// 翻訳カードを追加
function addCard(english, indonesian) {
    // 空の状態を消す
    if (emptyState) {
        emptyState.remove();
        emptyState = null;
    }

    // 既存のカードを「過去」にする
    var cards = document.querySelectorAll('.translation-card.latest');
    for (var i = 0; i < cards.length; i++) {
        cards[i].classList.remove('latest');
        cards[i].classList.add('past');
    }

    // 新しいカードを作成
    var card = document.createElement('div');
    card.className = 'translation-card latest';

    var enDiv = document.createElement('div');
    enDiv.className = 'en';
    enDiv.textContent = english;

    var idDiv = document.createElement('div');
    idDiv.className = 'id-text';
    idDiv.textContent = indonesian;

    var timeDiv = document.createElement('div');
    timeDiv.className = 'time-stamp';
    timeDiv.textContent = new Date().toLocaleTimeString();

    card.appendChild(enDiv);
    card.appendChild(idDiv);
    card.appendChild(timeDiv);

    translationDisplay.appendChild(card);

    // 下にスクロール
    translationDisplay.scrollTop = translationDisplay.scrollHeight;
}

// ボタン
startBtn.addEventListener('click', function () {
    if (!recognition) setupRecognition();
    try { recognition.start(); } catch (e) { console.error(e); }
});

stopBtn.addEventListener('click', function () {
    if (recognition) recognition.stop();
});

// 初期化
setupRecognition();
