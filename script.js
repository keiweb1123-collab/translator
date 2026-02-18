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
var liveCard = null;
var lastFinalCard = '';

// Android判定
var isAndroid = /Android/i.test(navigator.userAgent);

// Android用: テキストを溜めて一つにまとめる
var accumulatedText = '';
var finalizeTimer = null;
var FINALIZE_DELAY = 3000; // 3秒間沈黙したら確定
var translateTimer = null;

// ステータス表示
function showStatus(msg, color) {
    currentSpeechEl.textContent = msg;
    if (color) currentSpeechEl.style.color = color;
}

function showNotification(msg, type) {
    notificationArea.textContent = msg;
    notificationArea.className = 'notification ' + (type || 'warning');
    setTimeout(function () {
        notificationArea.className = 'notification hidden';
    }, 4000);
}

// Google翻訳
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

// 音声認識
function setupRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        showNotification('Chromeブラウザをお使いください', 'error');
        return false;
    }

    recognition = new SR();
    recognition.lang = 'id-ID';
    recognition.interimResults = true;

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
        showStatus('🎤 話してください...', '#00ff88');
    };

    recognition.onend = function () {
        isRunning = false;
        if (shouldRestart) {
            var delay = isAndroid ? 50 : 200;
            setTimeout(function () {
                try { recognition.start(); }
                catch (e) {
                    setTimeout(function () {
                        try { recognition.start(); } catch (e2) { resetButtons(); }
                    }, 500);
                }
            }, delay);
        } else {
            // 停止時、溜まったテキストを確定
            if (accumulatedText.trim()) {
                finalizeAccumulated();
            }
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

        if (isAndroid) {
            // === Android方式 ===
            // Androidでは「確定」が細切れに来るので、
            // 全部を溜めて1つのライブカードで表示し、
            // 3秒沈黙で確定する

            if (final_text.trim()) {
                accumulatedText += ' ' + final_text.trim();
                showStatus('🎤 ' + accumulatedText.trim(), '#88ccff');

                // ライブ翻訳（更新）
                clearTimeout(translateTimer);
                translateTimer = setTimeout(function () {
                    var textToTranslate = accumulatedText.trim();
                    translate(textToTranslate, function (translated) {
                        updateLiveCard(translated, textToTranslate);
                    });
                }, 300);

                // 3秒沈黙で確定
                clearTimeout(finalizeTimer);
                finalizeTimer = setTimeout(function () {
                    finalizeAccumulated();
                }, FINALIZE_DELAY);
            }

            if (interim.trim()) {
                showStatus('🎤 ' + accumulatedText + ' ' + interim, '#88ccff');
            }

        } else {
            // === PC方式（従来通り） ===
            if (final_text.trim()) {
                var text = final_text.trim();
                showStatus('✅ ' + text, '#00ff88');
                if (text === lastFinalCard) return;
                lastFinalCard = text;
                removeLiveCard();
                translate(text, function (translated) {
                    addCard(translated, text);
                });
            }

            if (interim.trim()) {
                showStatus('🎤 ' + interim, '#88ccff');
                clearTimeout(translateTimer);
                translateTimer = setTimeout(function () {
                    translate(interim.trim(), function (translated) {
                        updateLiveCard(translated, interim.trim());
                    });
                }, 800);
            }
        }
    };

    recognition.onerror = function (event) {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        var msg = '';
        switch (event.error) {
            case 'not-allowed':
                msg = '❌ マイクを許可してください';
                shouldRestart = false; break;
            case 'audio-capture':
                msg = '❌ マイクが見つかりません';
                shouldRestart = false; break;
            default:
                msg = '⚠️ ' + event.error;
        }
        if (msg) showStatus(msg, '#ff4444');
    };

    return true;
}

// 溜まったテキストを確定カードにする
function finalizeAccumulated() {
    var text = accumulatedText.trim();
    accumulatedText = '';
    clearTimeout(finalizeTimer);
    clearTimeout(translateTimer);
    if (!text) return;

    removeLiveCard();
    translate(text, function (translated) {
        addCard(translated, text);
    });
}

function resetButtons() {
    statusDot.className = 'status-dot off';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    showStatus('停止中', '#888');
}

// ライブカード（1つだけ、常に上書き更新）
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
    lastFinalCard = indonesian;
}

// ボタン
startBtn.addEventListener('click', function () {
    if (!recognition) { if (!setupRecognition()) return; }
    shouldRestart = true;
    accumulatedText = '';
    try { recognition.start(); }
    catch (e) { showNotification('起動エラー', 'error'); }
});

stopBtn.addEventListener('click', function () {
    shouldRestart = false;
    try { recognition.abort(); } catch (e) { }
    if (accumulatedText.trim()) finalizeAccumulated();
    removeLiveCard();
    resetButtons();
});

showStatus('「翻訳開始」を押してください', '#888');
