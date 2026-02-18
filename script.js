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
var shouldRestart = false;
var interimTimer = null;
var lastInterim = '';
var liveCard = null; // リアルタイム翻訳用のカード

// 画面にステータス表示
function showStatus(msg, color) {
    currentSpeechEl.textContent = msg;
    if (color) currentSpeechEl.style.color = color;
}

// 通知
function showNotification(msg, type) {
    notificationArea.textContent = msg;
    notificationArea.className = 'notification ' + (type || 'warning');
    setTimeout(function () {
        notificationArea.className = 'notification hidden';
    }, 5000);
}

// 音声認識セットアップ
function setupRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        showNotification('このブラウザは音声認識に対応していません。Chromeをお使いください。', 'error');
        return false;
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
        showStatus('🎤 マイクON - 話してください...', '#00ff88');
    };

    recognition.onend = function () {
        isRunning = false;
        // ライブカードが残っていたら確定
        finalizeLiveCard();

        if (shouldRestart) {
            showStatus('🔄 再接続中...', '#ffcc00');
            setTimeout(function () {
                try { recognition.start(); } catch (e) { resetButtons(); }
            }, 300);
        } else {
            resetButtons();
        }
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

        // ===== 確定テキスト =====
        if (final_text.trim()) {
            showStatus('✅ ' + final_text, '#00ff88');
            // ライブカードを確定に変換
            finalizeLiveCard();
            // 確定翻訳
            translateAndShow(final_text.trim(), false);
        }

        // ===== 途中経過テキスト → リアルタイム翻訳 =====
        if (interim.trim() && interim !== lastInterim) {
            lastInterim = interim;
            showStatus('🎤 ' + interim, '#88ccff');

            // 0.8秒間変化がなければ途中翻訳を実行
            clearTimeout(interimTimer);
            interimTimer = setTimeout(function () {
                translateAndShow(interim.trim(), true);
            }, 800);
        }
    };

    recognition.onerror = function (event) {
        var msg = '';
        switch (event.error) {
            case 'not-allowed':
                msg = '❌ マイクの許可がありません。設定でマイクを許可してください。';
                shouldRestart = false;
                break;
            case 'no-speech':
                msg = '🔇 音声が検出されません... 大きな声で話すか音量を上げてください';
                break;
            case 'audio-capture':
                msg = '❌ マイクが見つかりません。';
                shouldRestart = false;
                break;
            case 'network':
                msg = '❌ ネットワークエラー。';
                break;
            default:
                msg = '⚠️ ' + event.error;
        }
        showStatus(msg, '#ff4444');
        showNotification(msg, 'error');
    };

    return true;
}

function resetButtons() {
    statusDot.className = 'status-dot off';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    showStatus('停止中', '#888');
}

// ===== 翻訳 & 表示 =====
function translateAndShow(text, isLive) {
    var url = 'https://api.mymemory.translated.net/get?q='
        + encodeURIComponent(text) + '&langpair=id|en';

    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.responseStatus === 200 && data.responseData) {
                var translated = data.responseData.translatedText;
                if (isLive) {
                    updateLiveCard(translated, text);
                } else {
                    addCard(translated, text);
                }
            }
        })
        .catch(function (err) { /* エラーは無視（ライブ翻訳なので） */ });
}

// ===== ライブカード（話している途中の翻訳） =====
function updateLiveCard(english, indonesian) {
    if (emptyState) { emptyState.remove(); emptyState = null; }

    if (!liveCard) {
        liveCard = document.createElement('div');
        liveCard.className = 'translation-card live';
        liveCard.innerHTML = '<div class="live-label">⚡ LIVE</div>'
            + '<div class="en"></div>'
            + '<div class="id-text"></div>';
        translationDisplay.appendChild(liveCard);
    }

    liveCard.querySelector('.en').textContent = english;
    liveCard.querySelector('.id-text').textContent = indonesian;
    translationDisplay.scrollTop = translationDisplay.scrollHeight;
}

// ライブカードを確定カードに変換
function finalizeLiveCard() {
    if (!liveCard) return;
    var en = liveCard.querySelector('.en').textContent;
    var id = liveCard.querySelector('.id-text').textContent;
    liveCard.remove();
    liveCard = null;
    if (en && id) {
        // 確定翻訳で上書きされるので、ここでは追加しない
    }
}

// ===== 確定カード =====
function addCard(english, indonesian) {
    if (emptyState) { emptyState.remove(); emptyState = null; }

    // ライブカードを消す
    if (liveCard) { liveCard.remove(); liveCard = null; }

    // 既存のカードを過去にする
    var cards = document.querySelectorAll('.translation-card.latest');
    for (var i = 0; i < cards.length; i++) {
        cards[i].classList.remove('latest');
        cards[i].classList.add('past');
    }

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
    translationDisplay.scrollTop = translationDisplay.scrollHeight;
}

// ボタン
startBtn.addEventListener('click', function () {
    if (!recognition) { if (!setupRecognition()) return; }
    shouldRestart = true;
    try {
        recognition.start();
        showStatus('🎤 マイクを起動中...', '#ffcc00');
    } catch (e) {
        showNotification('マイク起動エラー: ' + e.message, 'error');
    }
});

stopBtn.addEventListener('click', function () {
    shouldRestart = false;
    if (recognition) recognition.stop();
    resetButtons();
});

// 初期化
showStatus('「翻訳開始」を押してください', '#888');
