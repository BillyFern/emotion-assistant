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

const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

async function setupCamera(){

    const stream = await navigator.mediaDevices.getUserMedia({

        video:{
            width:640,
            height:480
        }

    });

    video.srcObject = stream;

    return new Promise(resolve=>{

        video.onloadedmetadata=()=>{

            video.play();

            canvas.width=video.videoWidth;
            canvas.height=video.videoHeight;

            resolve();

        };

    });

}

async function main(){

    await loadEmotionModel();
    await setupCamera();

    const faceDetection = new FaceDetection({

        locateFile:(file)=>{
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
        }

    });

    faceDetection.setOptions({

        model:"short",

        minDetectionConfidence:0.6

    });

    faceDetection.onResults(results=>{

        ctx.clearRect(0,0,canvas.width,canvas.height);

        if(results.detections.length===0)
            return;

        const box = results.detections[0].boundingBox;

        const w = box.width * canvas.width;
        const h = box.height * canvas.height;

        const x = (box.xCenter * canvas.width) - w / 2;
        const y = (box.yCenter * canvas.height) - h / 2;

        ctx.strokeStyle = "lime";
        ctx.lineWidth = 3;

        ctx.strokeRect(
            x,
            y,
            w,
            h
        );

        // Crop detected face
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

        // Convert to Tensor
        let input = tf.browser.fromPixels(faceCanvas);

        input = input.toFloat();

        input = input.expandDims(0);

        const prediction = emotionModel.predict(input);

        prediction.data().then(probabilities=>{

            let maxIndex = 0;

            for(let i=1;i<probabilities.length;i++){

                if(probabilities[i] > probabilities[maxIndex])
                    maxIndex = i;

            }

            console.log(
                classNames[maxIndex],
                probabilities[maxIndex]
            );

            input.dispose();
            prediction.dispose();

        });

    });

    const camera=new Camera(video,{

        onFrame:async()=>{

            await faceDetection.send({
                image:video
            });

        },

        width:640,

        height:480

    });

    camera.start();

}

main();
