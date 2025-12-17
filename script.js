// script.js - Transfer Learning mit Android Fix

const statusDiv = document.getElementById('status');
const consoleDiv = document.getElementById('console-log');
const startBtn = document.getElementById('startBtn');
const initSection = document.getElementById('init-section');
const trainingSection = document.getElementById('training-section');

// Trainings-Buttons
const noiseBtn = document.getElementById('noiseBtn');
const class1Btn = document.getElementById('class1Btn');
const class2Btn = document.getElementById('class2Btn');
const trainModelBtn = document.getElementById('trainModelBtn');
const listenBtn = document.getElementById('listenBtn');

// Aufnahme-UI (Timeline + Spectrogramm)
const recordingUi = document.getElementById('recording-ui');
const recordingTitle = document.getElementById('recording-title');
const recordingTime = document.getElementById('recording-time');
const timelineFill = document.getElementById('timeline-fill');
const timelineMarker = document.getElementById('timeline-marker');
const spectrogramCanvas = document.getElementById('spectrogram');

let baseRecognizer;
let transferRecognizer;
let countNoise = 0;
let count1 = 0;
let count2 = 0;

const NOISE_LABEL = '_background_noise_';
const NOISE_RECORDING_SECONDS = 20;
const NOISE_EXAMPLES = 20; // 20 Sekunden => 20 Trainingsbeispiele

let recordingInProgress = false;
let recordingIntervalId = null;
let spectrogramController = null;
let uiStateBeforeRecording = null;

// Hilfsfunktion für Logs
function log(msg) {
    console.log(msg);
    // Optional: Log auch auf dem Schirm anzeigen für Mobile Debugging
    consoleDiv.innerText = msg;
}

async function app() {
    startBtn.disabled = true;

    // --- DEIN MIKROFON-FIX (UNVERÄNDERT) ---
    try {
        statusDiv.innerText = "Frage Mikrofon an (Android Fix)...";
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); 
        log("Mikrofon-Check erfolgreich.");
    } catch (err) {
        statusDiv.innerText = "FEHLER: Zugriff verweigert!";
        alert("Bitte Mikrofon zulassen.");
        startBtn.disabled = false;
        return;
    }
    // ---------------------------------------

    // 2. TensorFlow Basis-Modell laden
    try {
        statusDiv.innerText = "Lade Basis-KI...";
        baseRecognizer = speechCommands.create('BROWSER_FFT');
        await baseRecognizer.ensureModelLoaded();
        
        // Erstelle den Transfer-Recognizer (Leeres Modell zum Befüllen)
        transferRecognizer = baseRecognizer.createTransfer('custom-words');
        
        statusDiv.innerText = "Basis geladen. Bitte Training starten.";
        
        // UI Umschalten
        initSection.style.display = 'none';
        trainingSection.style.display = 'block';

    } catch (err) {
        statusDiv.innerText = "Fehler beim Laden: " + err.message;
        startBtn.disabled = false;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function enterRecordingUiState() {
    uiStateBeforeRecording = {
        noiseBtnDisabled: noiseBtn.disabled,
        class1BtnDisabled: class1Btn.disabled,
        class2BtnDisabled: class2Btn.disabled,
        trainModelBtnDisabled: trainModelBtn.disabled,
        listenBtnDisabled: listenBtn.disabled,
        noiseBtnText: noiseBtn.innerText,
    };

    noiseBtn.disabled = true;
    class1Btn.disabled = true;
    class2Btn.disabled = true;
    trainModelBtn.disabled = true;
    listenBtn.disabled = true;
}

function exitRecordingUiState() {
    if (!uiStateBeforeRecording) return;

    noiseBtn.disabled = uiStateBeforeRecording.noiseBtnDisabled;
    class1Btn.disabled = uiStateBeforeRecording.class1BtnDisabled;
    class2Btn.disabled = uiStateBeforeRecording.class2BtnDisabled;
    trainModelBtn.disabled = uiStateBeforeRecording.trainModelBtnDisabled;
    listenBtn.disabled = uiStateBeforeRecording.listenBtnDisabled;
    noiseBtn.innerText = uiStateBeforeRecording.noiseBtnText;
    uiStateBeforeRecording = null;

    updateCounts();
}

function updateRecordingProgress(elapsedMs, totalMs) {
    const clampedElapsedMs = Math.min(Math.max(elapsedMs, 0), totalMs);
    const progress = totalMs === 0 ? 0 : clampedElapsedMs / totalMs;
    const percent = Math.min(100, Math.max(0, progress * 100));
    const elapsedSeconds = clampedElapsedMs / 1000;

    timelineFill.style.width = `${percent}%`;
    timelineMarker.style.left = `${percent}%`;
    recordingTime.innerText = `${elapsedSeconds.toFixed(1)} / ${Math.round(totalMs / 1000)}s`;
}

function stopAnyLiveListening() {
    if (!transferRecognizer) return;
    if (typeof transferRecognizer.stopListening !== 'function') return;
    try {
        transferRecognizer.stopListening();
    } catch (_) {
        // ignore
    }
}

function resizeCanvasToDisplaySize(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.max(1, Math.floor(rect.width * dpr));
    const displayHeight = Math.max(1, Math.floor(rect.height * dpr));

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
    }
}

function amplitudeToRgb(amplitudeByte) {
    const v = Math.max(0, Math.min(1, amplitudeByte / 255));

    if (v < 0.33) {
        const t = v / 0.33;
        return [0, 0, Math.round(t * 255)];
    }
    if (v < 0.66) {
        const t = (v - 0.33) / 0.33;
        const r = Math.round(t * 255);
        return [r, 0, 255 - r];
    }
    const t = (v - 0.66) / 0.34;
    return [255, Math.round(t * 255), 0];
}

async function startSpectrogram() {
    if (!spectrogramCanvas) return null;

    resizeCanvasToDisplaySize(spectrogramCanvas);
    const canvasCtx = spectrogramCanvas.getContext('2d', { alpha: false });
    if (!canvasCtx) return null;

    canvasCtx.fillStyle = '#000';
    canvasCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContextCtor();
    await audioContext.resume();

    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.65;
    source.connect(analyser);

    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const column = canvasCtx.createImageData(1, spectrogramCanvas.height);

    const controller = {
        stream,
        audioContext,
        analyser,
        frequencyData,
        canvasCtx,
        column,
        rafId: null,
        running: true,
    };

    const draw = () => {
        if (!controller.running) return;

        analyser.getByteFrequencyData(frequencyData);
        canvasCtx.drawImage(spectrogramCanvas, -1, 0);

        const height = spectrogramCanvas.height;
        const bins = frequencyData.length;
        for (let y = 0; y < height; y++) {
            const bin = Math.floor((y / height) * bins);
            const amplitude = frequencyData[bins - 1 - bin];
            const [r, g, b] = amplitudeToRgb(amplitude);
            const idx = y * 4;
            column.data[idx] = r;
            column.data[idx + 1] = g;
            column.data[idx + 2] = b;
            column.data[idx + 3] = 255;
        }

        canvasCtx.putImageData(column, spectrogramCanvas.width - 1, 0);
        controller.rafId = requestAnimationFrame(draw);
    };

    controller.rafId = requestAnimationFrame(draw);
    return controller;
}

async function stopSpectrogram(controller) {
    if (!controller) return;
    controller.running = false;

    if (controller.rafId) {
        cancelAnimationFrame(controller.rafId);
        controller.rafId = null;
    }

    if (controller.stream) {
        controller.stream.getTracks().forEach(track => track.stop());
    }

    if (controller.audioContext && typeof controller.audioContext.close === 'function') {
        try {
            await controller.audioContext.close();
        } catch (_) {
            // ignore
        }
    }
}

// Funktion um Beispiele zu sammeln
async function collect(label) {
    if (!transferRecognizer) return;
    if (recordingInProgress) return;
    
    recordingInProgress = true;
    stopAnyLiveListening();
    enterRecordingUiState();

    const totalMs = 1000;
    const startedAt = performance.now();

    const labelUi =
        label === 'wort1' ? 'Wort A' :
        label === 'wort2' ? 'Wort B' :
        label === NOISE_LABEL ? 'Hintergrund' :
        label;

    recordingTitle.innerText = `Aufnahme: ${labelUi}`;
    recordingUi.style.display = 'block';
    updateRecordingProgress(0, totalMs);

    recordingIntervalId = window.setInterval(() => {
        updateRecordingProgress(performance.now() - startedAt, totalMs);
    }, 100);

    try {
        try {
            spectrogramController = await startSpectrogram();
        } catch (e) {
            log("Spectrogram konnte nicht gestartet werden: " + e.message);
        }

        statusDiv.innerText = `Nehme auf: "${labelUi}"...`;
        await transferRecognizer.collectExample(label);

        statusDiv.innerText = `Gespeichert: "${labelUi}"`;
        updateCounts();
    } catch (e) {
        statusDiv.innerText = "Aufnahme-Fehler: " + e.message;
    } finally {
        await stopSpectrogram(spectrogramController);
        spectrogramController = null;

        if (recordingIntervalId) {
            window.clearInterval(recordingIntervalId);
            recordingIntervalId = null;
        }
        updateRecordingProgress(totalMs, totalMs);
        recordingInProgress = false;
        exitRecordingUiState();
    }
}

async function collectNoiseTimed20s() {
    if (!transferRecognizer) return;
    if (recordingInProgress) return;

    recordingInProgress = true;
    stopAnyLiveListening();
    enterRecordingUiState();

    const totalMs = NOISE_RECORDING_SECONDS * 1000;
    const startedAt = performance.now();

    recordingTitle.innerText = `Aufnahme: Hintergrund (${NOISE_RECORDING_SECONDS}s)`;
    recordingUi.style.display = 'block';
    updateRecordingProgress(0, totalMs);

    noiseBtn.innerText = `Aufnahme läuft... (0/${NOISE_EXAMPLES})`;
    statusDiv.innerText = "Nehme Hintergrund auf...";

    recordingIntervalId = window.setInterval(() => {
        updateRecordingProgress(performance.now() - startedAt, totalMs);
    }, 100);

    try {
        try {
            spectrogramController = await startSpectrogram();
        } catch (e) {
            log("Spectrogram konnte nicht gestartet werden: " + e.message);
        }

        for (let i = 0; i < NOISE_EXAMPLES; i++) {
            noiseBtn.innerText = `Aufnahme läuft... (${i + 1}/${NOISE_EXAMPLES})`;
            await transferRecognizer.collectExample(NOISE_LABEL);

            const targetMs = (i + 1) * 1000;
            const elapsedMs = performance.now() - startedAt;
            if (elapsedMs < targetMs) {
                await sleep(targetMs - elapsedMs);
            }
        }

        updateCounts();
        statusDiv.innerText = `Hintergrund fertig (${NOISE_EXAMPLES} Beispiele).`;
    } catch (e) {
        statusDiv.innerText = "Aufnahme-Fehler: " + e.message;
    } finally {
        await stopSpectrogram(spectrogramController);
        spectrogramController = null;

        if (recordingIntervalId) {
            window.clearInterval(recordingIntervalId);
            recordingIntervalId = null;
        }
        updateRecordingProgress(totalMs, totalMs);
        recordingInProgress = false;
        exitRecordingUiState();
    }
}

function updateCounts() {
    // Zählt wie viele Beispiele wir für jedes Label haben
    const counts = transferRecognizer.countExamples();
    // counts sieht so aus: { '_background_noise_': 2, 'wort1': 5, ... }
    
    countNoise = counts[NOISE_LABEL] || 0;
    count1 = counts['wort1'] || 0; // Wir nennen Klasse 1 intern 'wort1'
    count2 = counts['wort2'] || 0; // Wir nennen Klasse 2 intern 'wort2'

    noiseBtn.innerText = `1. Hintergrund (${countNoise})`;
    class1Btn.innerText = `2. Wort A (${count1})`;
    class2Btn.innerText = `3. Wort B (${count2})`;

    // Training erst erlauben, wenn von allem etwas da ist
    if (countNoise > 0 && count1 > 0 && count2 > 0) {
        trainModelBtn.disabled = false;
        trainModelBtn.style.backgroundColor = "#28a745"; // Grün signalisieren
    }
}

// Event Listener für die Sammel-Buttons
noiseBtn.addEventListener('click', collectNoiseTimed20s);
// Wir mappen die Buttons auf feste interne Label-Namen
class1Btn.addEventListener('click', () => collect('wort1'));
class2Btn.addEventListener('click', () => collect('wort2'));

// Training starten
trainModelBtn.addEventListener('click', async () => {
    trainModelBtn.disabled = true;
    statusDiv.innerText = "Training läuft... bitte warten.";
    
    try {
        await transferRecognizer.train({
            epochs: 25,
            callback: {
                onEpochEnd: async (epoch, logs) => {
                    log(`Epoch ${epoch}: loss=${logs.loss.toFixed(4)}`);
                }
            }
        });
        statusDiv.innerText = "Training fertig! Drücke 'Testen'.";
        listenBtn.disabled = false;
        listenBtn.style.backgroundColor = "#0984e3";
    } catch (e) {
        statusDiv.innerText = "Trainings-Fehler: " + e.message;
    }
});

// Live Testen
listenBtn.addEventListener('click', () => {
    statusDiv.innerText = "Höre zu... Sage Wort A oder Wort B";
    listenBtn.disabled = true; // Verhindert doppelten Klick

    transferRecognizer.listen(result => {
        const scores = result.scores;
        const words = transferRecognizer.wordLabels();
        
        // Finde das Wort mit dem höchsten Score
        const maxScore = Math.max(...scores);
        const wordIndex = scores.indexOf(maxScore);
        const word = words[wordIndex];

        const scoreByLabel = new Map(words.map((label, i) => [label, scores[i]]));
        const backgroundScore = scoreByLabel.get(NOISE_LABEL) ?? 0;
        const wortAScore = scoreByLabel.get('wort1') ?? 0;
        const wortBScore = scoreByLabel.get('wort2') ?? 0;

        const wordUi =
            word === 'wort1' ? 'Wort A' :
            word === 'wort2' ? 'Wort B' :
            word === NOISE_LABEL ? 'Hintergrund' :
            word;
        
        statusDiv.innerText =
            `Top: ${wordUi} (${(maxScore * 100).toFixed(0)}%)` +
            ` | Hintergrund ${(backgroundScore * 100).toFixed(0)}%` +
            ` | Wort A ${(wortAScore * 100).toFixed(0)}%` +
            ` | Wort B ${(wortBScore * 100).toFixed(0)}%`;

        // Visuelles Feedback
        if (word === 'wort1' && maxScore > 0.75) {
            document.body.style.backgroundColor = '#d4edda'; // Grünlich für Wort A
        } else if (word === 'wort2' && maxScore > 0.75) {
            document.body.style.backgroundColor = '#f8d7da'; // Rötlich für Wort B
        } else if (word === NOISE_LABEL && maxScore > 0.75) {
            document.body.style.backgroundColor = '#f1f3f5'; // Grau für Hintergrund
        } else {
            document.body.style.backgroundColor = '#fff'; // Neutral
        }

    }, {
        probabilityThreshold: 0.75,
        invokeCallbackOnNoiseAndUnknown: true
    });
});

startBtn.addEventListener('click', app);
