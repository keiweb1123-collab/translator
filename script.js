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
var lastTranslatedText = '';
var restartCount = 0;

// Android判定
var isAndroid = /Android/i.test(navigator.userAgent);

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
    }, 4000);
}

// Google翻訳（無料、APIキー不要）
function translate(text, callback) {
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx'
        + '&sl=id&tl=en&dt=t&q=' + encodeURIComponent(text);

    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var result = '';
            if (data && data[0]) {
                for (var i = 0; i < data[0].length; i++) {
                    if (data[0][i][0]) result += data[0][i][0];
                }
            }
            if (result) callback(result);
        })
        .catch(function () { });
}

// 音声認識セットアップ
function setupRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        showNotification('Chromeブラウザをお使いください', 'error');
        return false;
    }

    recognition = new SR();
    recognition.lang = 'id-ID';
    recognition.interimResults = true;

    // Androidでは continuous が不安定なので、
    // 短い認識を繰り返す方式にする
    if (isAndroid) {
        recognition.continuous = false;
    } else {
        recognition.continuous = true;
    }

    recognition.onstart = function () {
        statusDot.className = 'status-dot on';
        startBtn.disabled = true;
        stopBtn.disabled = false;
        previewBar.classList.remove('hidden');
        isRunning = true;
        if (restartCount === 0) {
            showStatus('🎤 話してください...', '#00ff88');
        }
    };

    recognition.onend = function () {
        isRunning = false;

        // 自動再起動（停止ボタンを押していない限り）
        if (shouldRestart) {
            restartCount++;
            // Androidでは少し待ってから再起動（安定性のため）
            var delay = isAndroid ? 100 : 200;
            setTimeout(function () {
                try {
                    recognition.start();
                } catch (e) {
                    // すでに起動中の場合のエラーは無視
                    setTimeout(function () {
                        try { recognition.start(); } catch (e2) { resetButtons(); }
                    }, 500);
                }
            }, delay);
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

        // 確定テキスト
        if (final_text.trim()) {
            var text = final_text.trim();
            showStatus('✅ ' + text, '#00ff88');

            // 重複チェック
            if (text === lastTranslatedText) return;
            lastTranslatedText = text;

            removeLiveCard();
            clearTimeout(interimTimer);

            translate(text, function (translated) {
                addCard(translated, text);
            });
        }

        // 途中経過 → ライブ翻訳
        if (interim.trim()) {
            showStatus('🎤 ' + interim, '#88ccff');
            clearTimeout(interimTimer);
            interimTimer = setTimeout(function () {
                translate(interim.trim(), function (translated) {
                    updateLiveCard(translated, interim.trim());
                });
            }, 800);
        }
    };

    recognition.onerror = function (event) {
        // no-speech は Android で頻繁に起きるので無視
        if (event.error === 'no-speech') {
            showStatus('🎤 聞き取り中...音量を上げてみてください', '#ffcc00');
            return;
        }
        if (event.error === 'aborted') return; // 再起動時に出る

        var msg = '';
        switch (event.error) {
            case 'not-allowed':
                msg = '❌ マイクを許可してください（ブラウザの設定で「マイク」→「許可」）';
                shouldRestart = false;
                break;
            case 'audio-capture':
                msg = '❌ マイクが見つかりません';
                shouldRestart = false;
                break;
            case 'network':
                msg = '❌ ネットワークエラー';
                break;
            default:
                msg = '⚠️ ' + event.error;
        }
        if (msg) {
            showStatus(msg, '#ff4444');
            showNotification(msg, 'error');
        }
    };

    return true;
}

function resetButtons() {
    statusDot.className = 'status-dot off';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    showStatus('停止中', '#888');
    restartCount = 0;
}

// ライブカード
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

// 確定カード
function addCard(english, indonesian) {
    if (emptyState) { emptyState.remove(); emptyState = null; }
    removeLiveCard();

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
    restartCount = 0;
    try {
        recognition.start();
    } catch (e) {
        showNotification('起動エラー: ' + e.message, 'error');
    }
});

stopBtn.addEventListener('click', function () {
    shouldRestart = false;
    if (recognition) {
        try { recognition.abort(); } catch (e) { }
    }
    removeLiveCard();
    resetButtons();
});

showStatus('「翻訳開始」を押してください', '#888');
