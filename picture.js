const { exec } = require("child_process");

exec(
  "fswebcam -r 320x240 -S 3 --jpeg 50 --save /home/amitmishra/Graminno/grammino-chat-backend/uploads/%H%M%S.jpg",
  (err, stdout, stderr) => {
    if (err) {
      console.error(`exec error: ${err}`);
      return;
    }

    console.log(`Number of files ${stdout}`);
  }
);
