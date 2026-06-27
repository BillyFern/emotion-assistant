let emotionModel = null;

async function loadEmotionModel() {

    emotionModel = await tf.loadGraphModel(
        "./model/model.json"
    );

    console.log("Emotion model loaded!");
}

const faceCanvas = document.createElement("canvas");
faceCanvas.width = 48;
faceCanvas.height = 48;

const faceCtx = faceCanvas.getContext("2d");

const classNames = [
    "Angry",
    "Fearful",
    "Happy",
    "Neutral",
    "Sad",
    "Surprised"
];

// -------------------------
// Detection settings
// -------------------------

const detectionInterval = 200; // ms
let lastDetection = 0;

// -------------------------
// EMA smoothing
// -------------------------

let smoothedPrediction = null;
const alpha = 0.4;

// -------------------------
// Stable prediction
// -------------------------

let displayEmotion = "Detecting...";
let displayConfidence = 0;

// Last detected face
let lastBox = null;

const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

async function setupCamera() {

    const stream = await navigator.mediaDevices.getUserMedia({

        video: {
            width: 640,
            height: 480
        }

    });

    video.srcObject = stream;

    return new Promise(resolve => {

        video.onloadedmetadata = () => {

            video.play();

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            resolve();

        };

    });

}

function drawLabel() {

    ctx.fillStyle = "black";

    ctx.fillRect(
        lastBox.x,
        lastBox.y - 35,
        220,
        30
    );

    ctx.strokeStyle = "white";

    ctx.lineWidth = 1;

    ctx.strokeRect(
        lastBox.x,
        lastBox.y - 35,
        220,
        30
    );

    ctx.fillStyle = "white";

    ctx.font = "20px Arial";

    ctx.fillText(
        `${displayEmotion} (${(displayConfidence * 100).toFixed(1)}%)`,
        lastBox.x + 8,
        lastBox.y - 12
    );

}

async function main() {

    await loadEmotionModel();
    await setupCamera();

    const faceDetection = new FaceDetection({

        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
        }

    });

    faceDetection.setOptions({

        model: "short",

        minDetectionConfidence: 0.6

    });

    faceDetection.onResults(async (results) => {

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.detections.length === 0)
            return;

        // -------------------------
        // Only detect every 200 ms
        // -------------------------

        const now = Date.now();

        if (now - lastDetection < detectionInterval) {

            // Draw previous result only

            if (lastBox != null) {

                ctx.strokeStyle = "lime";
                ctx.lineWidth = 3;

                ctx.strokeRect(
                    lastBox.x,
                    lastBox.y,
                    lastBox.w,
                    lastBox.h
                );

                drawLabel();
            }

            return;
        }

        lastDetection = now;

        //-------------------------------------------------
        // Largest face
        //-------------------------------------------------

        const box = results.detections[0].boundingBox;

        const w = box.width * canvas.width;
        const h = box.height * canvas.height;

        const x = box.xCenter * canvas.width - w / 2;
        const y = box.yCenter * canvas.height - h / 2;

        lastBox = { x, y, w, h };

        //-------------------------------------------------
        // Draw face crop
        //-------------------------------------------------

        faceCtx.drawImage(
            video,
            x,
            y,
            w,
            h,
            0,
            0,
            48,
            48
        );

        //-------------------------------------------------
        // Tensor
        //-------------------------------------------------

        let input = tf.browser.fromPixels(faceCanvas);

        input = input.toFloat();

        input = input.expandDims(0);

        //-------------------------------------------------
        // Predict
        //-------------------------------------------------

        const prediction = emotionModel.predict(input);

        const probabilities = await prediction.data();

        //-------------------------------------------------
        // EMA smoothing
        //-------------------------------------------------

        if (smoothedPrediction == null) {

            smoothedPrediction = Array.from(probabilities);

        } else {

            for (let i = 0; i < probabilities.length; i++) {

                smoothedPrediction[i] =
                    alpha * probabilities[i] +
                    (1 - alpha) * smoothedPrediction[i];

            }

        }

        //-------------------------------------------------
        // Highest probability
        //-------------------------------------------------

        let maxIndex = 0;

        for (let i = 1; i < smoothedPrediction.length; i++) {

            if (smoothedPrediction[i] >
                smoothedPrediction[maxIndex]) {

                maxIndex = i;

            }

        }

        const confidence = smoothedPrediction[maxIndex];

        //-------------------------------------------------
        // Confidence threshold
        //-------------------------------------------------

        if (confidence >= 0.60) {

            displayEmotion = classNames[maxIndex];
            displayConfidence = confidence;

        }

        input.dispose();
        prediction.dispose();

        //-------------------------------------------------
        // Draw
        //-------------------------------------------------

        ctx.strokeStyle = "lime";
        ctx.lineWidth = 3;

        ctx.strokeRect(x, y, w, h);

        drawLabel();

    });

    const camera = new Camera(video, {

        onFrame: async () => {

            await faceDetection.send({
                image: video
            });

        },

        width: 640,

        height: 480

    });

    camera.start();

}

main();
