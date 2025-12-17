// script.js (Passend für Ihre einfache index.html)

const statusDiv = document.getElementById('status');
const startBtn = document.getElementById('startBtn');

let recognizer;

async function app() {
    startBtn.disabled = true;

    // 1. Mikrofon-Fix für Android
    try {
        statusDiv.innerText = "Frage Mikrofon an...";
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); 
        console.log("Mikrofon OK.");
    } catch (err) {
        statusDiv.innerText = "FEHLER: Zugriff verweigert!";
        alert("Bitte Mikrofon zulassen.");
        startBtn.disabled = false;
        return;
    }

    // 2. TensorFlow starten
    try {
        statusDiv.innerText = "Lade KI-Modell...";
        recognizer = speechCommands.create('BROWSER_FFT');
        await recognizer.ensureModelLoaded();
        
        statusDiv.innerText = "Hört zu... (Sage 'Up', 'Down')";

        recognizer.listen(result => {
            const scores = result.scores;
            const words = recognizer.wordLabels();
            const maxScore = Math.max(...scores);
            const word = words[scores.indexOf(maxScore)];
            
            statusDiv.innerText = `Erkannt: ${word} (${(maxScore*100).toFixed(0)}%)`;
            
            if (word === 'up' || word === 'down') {
                document.body.style.backgroundColor = word === 'up' ? '#d4edda' : '#f8d7da';
            }
        }, {
            probabilityThreshold: 0.75
        });
        
    } catch (err) {
        statusDiv.innerText = "Fehler: " + err.message;
        startBtn.disabled = false;
    }
}

startBtn.addEventListener('click', app);