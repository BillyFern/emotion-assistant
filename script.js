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

        const bbox = results.detections[0].locationData.relativeBoundingBox;

        const x = bbox.xMin * canvas.width;
        const y = bbox.yMin * canvas.height;
        const w = bbox.width * canvas.width;
        const h = bbox.height * canvas.height;

        ctx.strokeStyle = "lime";
        ctx.lineWidth = 3;

        ctx.strokeRect(
            x,
            y,
            w,
            h
        );
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