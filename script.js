const video = document.getElementById("webcam");

async function setupCamera() {

    try {

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 640,
                height: 480
            },
            audio: false
        });

        video.srcObject = stream;

        return new Promise((resolve) => {

            video.onloadedmetadata = () => {

                console.log("Camera Ready!");

                resolve(video);

            };

        });

    } catch (err) {

        console.error(err);

        alert("Unable to access webcam.");

    }

}

setupCamera();