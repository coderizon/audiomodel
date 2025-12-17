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

let baseRecognizer;
let transferRecognizer;
let countNoise = 0;
let count1 = 0;
let count2 = 0;

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

// Funktion um Beispiele zu sammeln
async function collect(label) {
    if (!transferRecognizer) return;
    
    // UI Feedback: Button kurz deaktivieren
    statusDiv.innerText = `Nehme auf: "${label}"...`;
    
    // WICHTIG: collectExample nimmt das Audio vom Mic
    await transferRecognizer.collectExample(label);
    
    statusDiv.innerText = `Gespeichert: "${label}"`;
    updateCounts();
}

function updateCounts() {
    // Zählt wie viele Beispiele wir für jedes Label haben
    const counts = transferRecognizer.countExamples();
    // counts sieht so aus: { '_background_noise_': 2, 'wort1': 5, ... }
    
    countNoise = counts['_background_noise_'] || 0;
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
noiseBtn.addEventListener('click', () => collect('_background_noise_'));
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
        
        statusDiv.innerText = `Erkannt: ${word} (${(maxScore*100).toFixed(0)}%)`;

        // Visuelles Feedback
        if (word === 'wort1' && maxScore > 0.75) {
            document.body.style.backgroundColor = '#d4edda'; // Grünlich für Wort A
        } else if (word === 'wort2' && maxScore > 0.75) {
            document.body.style.backgroundColor = '#f8d7da'; // Rötlich für Wort B
        } else {
            document.body.style.backgroundColor = '#fff'; // Neutral
        }

    }, {
        probabilityThreshold: 0.75
    });
});

startBtn.addEventListener('click', app);