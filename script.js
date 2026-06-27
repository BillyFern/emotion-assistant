const emotionText = document.getElementById("emotion");
const assistantText = document.getElementById("assistant");

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

// -------------------------
// Assistant
// -------------------------

let assistantMessage = "Hello!";

let currentEmotion = null;
let previousEmotion = null;

let emotionStartTime = Date.now();

const stableDuration = 3000;     // 3 seconds
const messageCooldown = 8000;    // 8 seconds

let lastMessageTime = 0;

const stableResponses = {

    Happy: [

        "You seem very happy today!",
        "Keep smiling!",
        "Looks like something made your day.",
        "It's nice seeing you in a good mood."

    ],

    Neutral: [

        "What's on your mind today?",
        "Hope you're having a good day.",
        "Anything interesting happening today?",
        "How has your day been so far?"

    ],

    Sad: [

        "I hope things get better soon.",
        "Take things one step at a time.",
        "Remember to be kind to yourself.",
        "Tomorrow is another opportunity."

    ],

    Angry: [

        "Try taking a slow deep breath.",
        "Maybe a short break could help.",
        "Hopefully things calm down soon.",
        "Don't let one moment ruin your day."

    ],

    Fearful: [

        "Everything will be okay.",
        "Take your time.",
        "One step at a time.",
        "You're doing just fine."

    ],

    Surprised: [

        "That caught you off guard!",
        "Something unexpected happened?",
        "Quite a reaction!",
        "Well, that was surprising."

    ]

};

const transitionResponses = {

    "Neutral->Happy": [

        "Something made you smile!",
        "Looks like your mood improved!",
        "Glad to see that smile."

    ],

    "Happy->Sad": [

        "That was quite a mood change.",
        "Hope everything is okay.",
        "I hope things get better."

    ],

    "Sad->Happy": [

        "That's wonderful to see!",
        "Glad things are looking brighter.",
        "Welcome back, smile!"

    ],

    "Angry->Neutral": [

        "Looks like you've calmed down.",
        "Feeling a little better?",
        "That's good to see."

    ],

    "Neutral->Angry": [

        "Something bothering you?",
        "Take it easy.",
        "Maybe take a short break."

    ],

    "Fearful->Neutral": [

        "You seem more relaxed now.",
        "Glad you're feeling calmer."

    ],

    "Neutral->Fearful": [

        "Everything alright?",
        "Take a deep breath."

    ],

    "Surprised->Happy": [

        "Hopefully it was good news!",
        "Looks like it made your day."

    ]

};

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

function randomResponse(list) {

    return list[
        Math.floor(Math.random() * list.length)
    ];

}

function drawLabel() {

    const text = `${displayEmotion} (${(displayConfidence * 100).toFixed(1)}%)`;

    ctx.font = "bold 18px Arial";

    // Measure text width
    const padding = 10;
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;

    const boxWidth = textWidth + padding * 2;
    const boxHeight = 40;

    const boxX = lastBox.x;
    const boxY = lastBox.y - boxHeight;

    // Draw black background
    ctx.fillStyle = "black";
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Draw white border
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

    // Draw text
    ctx.fillStyle = "white";
    ctx.fillText(text, boxX + padding, boxY + 25);
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

            const detectedEmotion = classNames[maxIndex];

            displayEmotion = detectedEmotion;
            displayConfidence = confidence;
            emotionText.textContent =
                `${displayEmotion} (${(displayConfidence * 100).toFixed(1)}%)`;
            //------------------------------------
            // Emotion changed
            //------------------------------------

            if (detectedEmotion !== currentEmotion) {

                previousEmotion = currentEmotion;
                currentEmotion = detectedEmotion;

                emotionStartTime = Date.now();

                const transition =
                    `${previousEmotion}->${currentEmotion}`;

                if (transitionResponses[transition]) {

                    assistantMessage =
                        randomResponse(
                            transitionResponses[transition]
                        );
                    assistantText.textContent = assistantMessage;

                }
                else {

                    assistantMessage =
                        randomResponse(
                            stableResponses[currentEmotion]
                        );
                    assistantText.textContent = assistantMessage;

                }

                lastMessageTime = Date.now();

            }

            //------------------------------------
            // Emotion stayed stable
            //------------------------------------

            else {

                if (

                    Date.now() - emotionStartTime >= stableDuration &&
                    Date.now() - lastMessageTime >= messageCooldown

                ) {

                    assistantMessage =
                        randomResponse(
                            stableResponses[currentEmotion]
                        );

                    lastMessageTime = Date.now();

                }

            }

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
