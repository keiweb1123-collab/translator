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
var liveCard = null;
var lastTranslatedText = ''; // 重複防止用

// ステータス表示
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

// Google翻訳（無料エンドポイント、APIキー不要）
function translate(text, callback) {
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx'
        + '&sl=id&tl=en&dt=t&q=' + encodeURIComponent(text);

    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            // レスポンス: [[["translated","original",...],...]...]
            var result = '';
            if (data && data[0]) {
                for (var i = 0; i < data[0].length; i++) {
                    if (data[0][i][0]) result += data[0][i][0];
                }
            }
            if (result) callback(result);
        })
        .catch(function (err) { /* 静かに失敗 */ });
}

// 音声認識
function setupRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        showNotification('Chromeブラウザをお使いください', 'error');
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
        showStatus('🎤 話してください...', '#00ff88');
    };

    recognition.onend = function () {
        isRunning = false;
        if (shouldRestart) {
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
            var text = final_text.trim();
            showStatus('✅ ' + text, '#00ff88');

            // 重複チェック：前回と同じテキストなら無視
            if (text === lastTranslatedText) return;
            lastTranslatedText = text;

            // ライブカードを消して確定翻訳
            removeLiveCard();
            clearTimeout(interimTimer);

            translate(text, function (translated) {
                addCard(translated, text);
            });
        }

        // ===== 途中経過 → ライブ翻訳 =====
        if (interim.trim()) {
            showStatus('🎤 ' + interim, '#88ccff');
            clearTimeout(interimTimer);
            interimTimer = setTimeout(function () {
                translate(interim.trim(), function (translated) {
                    updateLiveCard(translated, interim.trim());
                });
            }, 1000);
        }
    };

    recognition.onerror = function (event) {
        var msg = '';
        switch (event.error) {
            case 'not-allowed':
                msg = '❌ マイクを許可してください';
                shouldRestart = false; break;
            case 'no-speech':
                msg = '🔇 音声が聞こえません...音量を上げてください';
                break;
            case 'audio-capture':
                msg = '❌ マイクが見つかりません';
                shouldRestart = false; break;
            default:
                msg = '⚠️ ' + event.error;
        }
        showStatus(msg, '#ff4444');
    };

    return true;
}

function resetButtons() {
    statusDot.className = 'status-dot off';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    showStatus('停止中', '#888');
}

// ===== ライブカード =====
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

function removeLiveCard() {
    if (liveCard) { liveCard.remove(); liveCard = null; }
}

// ===== 確定カード =====
function addCard(english, indonesian) {
    if (emptyState) { emptyState.remove(); emptyState = null; }
    removeLiveCard();

    // 既存のlatestを過去にする
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
    } catch (e) {
        showNotification('起動エラー: ' + e.message, 'error');
    }
});

stopBtn.addEventListener('click', function () {
    shouldRestart = false;
    if (recognition) recognition.stop();
    removeLiveCard();
    resetButtons();
});

showStatus('「翻訳開始」を押してください', '#888');
