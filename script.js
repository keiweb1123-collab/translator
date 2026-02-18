/*
 * リアルタイム翻訳ツール - 最終版
 * PC・Android両対応
 */

// ===== DOM =====
var startBtn = document.getElementById('startBtn');
var stopBtn = document.getElementById('stopBtn');
var statusDot = document.getElementById('statusDot');
var translationDisplay = document.getElementById('translationDisplay');
var currentSpeechEl = document.getElementById('currentSpeech');
var previewBar = document.getElementById('previewBar');
var emptyState = document.getElementById('emptyState');
var notificationArea = document.getElementById('notificationArea');

// ===== 設定 =====
var isAndroid = /Android/i.test(navigator.userAgent);
var recognition = null;
var shouldRestart = false;

// 翻訳管理
var currentText = '';       // 今聞いている文章（最新版）
var liveCard = null;        // 画面上の1枚のライブカード
var doneTexts = [];         // 確定済みテキスト（重複防止）
var silenceTimer = null;    // 沈黙検知タイマー
var liveTranslateTimer = null;

// ===== ユーティリティ =====
function showStatus(msg, color) {
    currentSpeechEl.textContent = msg;
    if (color) currentSpeechEl.style.color = color;
}

function showNotification(msg) {
    notificationArea.textContent = msg;
    notificationArea.className = 'notification warning';
    setTimeout(function () {
        notificationArea.className = 'notification hidden';
    }, 4000);
}

// ===== Google翻訳 =====
function translate(text, callback) {
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx'
        + '&sl=id&tl=en&dt=t&q=' + encodeURIComponent(text);
    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var result = '';
            if (data && data[0]) {
                for (var i = 0; i < data[0].length; i++) {
                    if (data[0][i] && data[0][i][0]) result += data[0][i][0];
                }
            }
            if (result) callback(result);
        })
        .catch(function () { });
}

// ===== 音声認識 =====
function setupRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        showNotification('Chromeブラウザが必要です');
        return false;
    }

    recognition = new SR();
    recognition.lang = 'id-ID';
    recognition.interimResults = true;
    recognition.continuous = !isAndroid; // Android=false, PC=true
    recognition.maxAlternatives = 1;

    recognition.onstart = function () {
        statusDot.className = 'status-dot on';
        startBtn.disabled = true;
        stopBtn.disabled = false;
        previewBar.classList.remove('hidden');
        showStatus('🎤 話してください...', '#00ff88');
    };

    recognition.onend = function () {
        if (shouldRestart) {
            // 超高速で再起動（ユーザーには途切れないように見せる）
            setTimeout(function () {
                try { recognition.start(); } catch (e) {
                    setTimeout(function () {
                        try { recognition.start(); } catch (e2) { fullStop(); }
                    }, 500);
                }
            }, 50);
        } else {
            // 完全停止
            finalizeCurrent();
            fullStop();
        }
    };

    recognition.onresult = function (event) {
        // 最新の結果だけを使う（古い結果は無視 → 重複防止）
        var latestResult = event.results[event.results.length - 1];
        var text = latestResult[0].transcript.trim();
        var isFinal = latestResult.isFinal;

        if (!text) return;

        if (isAndroid) {
            handleAndroidResult(text, isFinal);
        } else {
            handlePCResult(text, isFinal);
        }
    };

    recognition.onerror = function (event) {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        if (event.error === 'not-allowed') {
            showStatus('❌ マイクを許可してください', '#ff4444');
            showNotification('ブラウザのアドレスバー横の鍵マーク → マイク → 許可');
            shouldRestart = false;
            return;
        }
        if (event.error === 'network') {
            showStatus('❌ ネット接続を確認してください', '#ff4444');
            return;
        }
    };

    return true;
}

// ===== Android用の処理 =====
// Androidでは各セッションで1つの結果が返される
// "Saya"(session1) → "selalu"(session2) → "bilang"(session3)
// これらを1つの文としてまとめる
function handleAndroidResult(text, isFinal) {
    if (isFinal) {
        // 新しいテキストを追加（重複チェック付き）
        if (currentText && !currentText.endsWith(text)) {
            currentText = currentText + ' ' + text;
        } else if (!currentText) {
            currentText = text;
        }

        showStatus('🎤 ' + currentText, '#88ccff');

        // ライブ翻訳（0.5秒後に更新）
        clearTimeout(liveTranslateTimer);
        liveTranslateTimer = setTimeout(function () {
            var finalText = currentText;
            translate(finalText, function (translated) {
                showLiveCard(translated, finalText);
            });
        }, 500);

        // 3秒沈黙で確定
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(function () {
            finalizeCurrent();
        }, 3000);
    } else {
        // 途中経過はステータスのみ表示
        var display = currentText ? currentText + ' ' + text : text;
        showStatus('🎤 ' + display, '#88ccff');
    }
}

// ===== PC用の処理 =====
function handlePCResult(text, isFinal) {
    if (isFinal) {
        // 重複チェック
        if (isDuplicate(text)) return;

        showStatus('✅ ' + text, '#00ff88');
        removeLiveCard();
        clearTimeout(liveTranslateTimer);

        translate(text, function (translated) {
            addFinalCard(translated, text);
        });
    } else {
        // 途中経過 → ライブ翻訳
        showStatus('🎤 ' + text, '#88ccff');
        clearTimeout(liveTranslateTimer);
        liveTranslateTimer = setTimeout(function () {
            translate(text, function (translated) {
                showLiveCard(translated, text);
            });
        }, 800);
    }
}

// ===== 重複チェック =====
function isDuplicate(text) {
    for (var i = 0; i < doneTexts.length; i++) {
        // 完全一致 or 含まれている場合は重複
        if (doneTexts[i] === text || doneTexts[i].indexOf(text) >= 0) {
            return true;
        }
    }
    return false;
}

// ===== 今のテキストを確定カードにする =====
function finalizeCurrent() {
    var text = currentText.trim();
    currentText = '';
    clearTimeout(silenceTimer);
    clearTimeout(liveTranslateTimer);

    if (!text || isDuplicate(text)) {
        removeLiveCard();
        return;
    }

    removeLiveCard();
    translate(text, function (translated) {
        addFinalCard(translated, text);
    });
}

// ===== ライブカード（1枚だけ、常に上書き） =====
function showLiveCard(english, indonesian) {
    if (emptyState) { emptyState.remove(); emptyState = null; }

    if (!liveCard) {
        liveCard = document.createElement('div');
        liveCard.className = 'translation-card live';
        liveCard.innerHTML = '<div class="live-label">⚡ LIVE</div>'
            + '<div class="en"></div>'
            + '<div class="id-text"></div>';
        translationDisplay.appendChild(liveCard);
    }

    // 常に同じカードの中身を更新（新しいカードは作らない）
    liveCard.querySelector('.en').textContent = english;
    liveCard.querySelector('.id-text').textContent = indonesian;
    translationDisplay.scrollTop = translationDisplay.scrollHeight;
}

function removeLiveCard() {
    if (liveCard) {
        liveCard.remove();
        liveCard = null;
    }
}

// ===== 確定カード =====
function addFinalCard(english, indonesian) {
    if (emptyState) { emptyState.remove(); emptyState = null; }
    removeLiveCard();

    // 重複防止リストに追加（最大20件）
    doneTexts.push(indonesian);
    if (doneTexts.length > 20) doneTexts.shift();

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

// ===== 完全停止 =====
function fullStop() {
    statusDot.className = 'status-dot off';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    showStatus('停止中', '#888');
}

// ===== ページの可視性変更（タブ切替・画面ロック対応） =====
document.addEventListener('visibilitychange', function () {
    if (document.hidden && shouldRestart) {
        // 画面が消えたら一時停止（バッテリー節約）
        try { recognition.abort(); } catch (e) { }
    } else if (!document.hidden && shouldRestart) {
        // 画面が戻ったら再開
        setTimeout(function () {
            try { recognition.start(); } catch (e) { }
        }, 500);
    }
});

// ===== ボタン =====
startBtn.addEventListener('click', function () {
    if (!recognition) {
        if (!setupRecognition()) return;
    }
    shouldRestart = true;
    currentText = '';
    doneTexts = [];
    try {
        recognition.start();
    } catch (e) {
        // 既に動いている場合は再起動
        try { recognition.abort(); } catch (e2) { }
        setTimeout(function () {
            try { recognition.start(); } catch (e3) { }
        }, 300);
    }
});

stopBtn.addEventListener('click', function () {
    shouldRestart = false;
    clearTimeout(silenceTimer);
    clearTimeout(liveTranslateTimer);
    try { recognition.abort(); } catch (e) { }
    finalizeCurrent();
    removeLiveCard();
    fullStop();
});

// ===== 初期表示 =====
showStatus('「翻訳開始」を押してください', '#888');
if (isAndroid) {
    showNotification('Android版: 音量を上げるとよく聞こえます');
}
