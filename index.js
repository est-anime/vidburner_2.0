const express = require('express');
const fileUpload = require('express-fileupload');
const { exec } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json()); // Parse JSON bodies
app.use(fileUpload()); // File upload middleware

// Serve static files from the "public" directory
app.use(express.static(__dirname + '/public'));

// Serve static files from the "uploads" directory
app.use('/uploads', express.static(__dirname + '/uploads'));

// Queue to manage video encoding requests
const encodingQueue = [];
const MAX_CONCURRENT_ENCODINGS = 2; // Maximum number of concurrent encoding processes

// Function to process the next encoding request in the queue
function processNextEncoding() {
  if (encodingQueue.length > 0) {
    const nextRequest = encodingQueue.shift();
    encodeVideo(...nextRequest);
  }
}

// Route to handle video upload and encoding request
app.post('/upload', (req, res) => {
  if (!req.files || !req.files.video || !req.files.subtitles) {
    return res.status(400).send('Please upload both video and subtitles.');
  }

  const videoFile = req.files.video;
  const subtitlesFile = req.files.subtitles;
  const selectedFont = req.body.font || 'Arial-Bold';
  const outputFileName = req.body.outputFileName || 'output.mp4';
  const userEmail = req.body.email;

  const videoPath = __dirname + '/uploads/video.mp4';
  const subtitlesPath = __dirname + '/uploads/subtitles.srt';
  const outputPath = path.join(__dirname, 'uploads', outputFileName);

  videoFile.mv(videoPath, (err) => {
    if (err) {
      console.error(`Error: ${err.message}`);
      return res.status(500).send('Error occurred while uploading the video.');
    }

    subtitlesFile.mv(subtitlesPath, (err) => {
      if (err) {
        console.error(`Error: ${err.message}`);
        return res.status(500).send('Error occurred while uploading the subtitles.');
      }

      // Add encoding request to the queue
      encodingQueue.push([videoPath, subtitlesPath, selectedFont, outputPath, userEmail]);
      
      // Start processing encoding requests if the maximum concurrency limit is not reached
      while (encodingQueue.length > 0 && encodingQueue.length <= MAX_CONCURRENT_ENCODINGS) {
        processNextEncoding();
      }

      // Send response to client
      res.send('Video encoding request added to the queue.');
    });
  });
});

// Function to encode a video
// Function to encode a video
function encodeVideo(videoPath, subtitlesPath, selectedFont, outputPath, userEmail) {
  const fontMapping = {
    'Arial-Bold': 'Arial-Bold.ttf',
    'Juventus Fans Bold': 'Juventus-Fans-Bold.ttf',
    'Tungsten-Bold': 'Tungsten-Bold.ttf'
  };

  const selectedFontFile = fontMapping[selectedFont];

  if (!selectedFontFile) {
    return console.error('Selected font is not supported.');
  }

  const fullFontPath = path.join(__dirname, 'fonts', selectedFontFile);

  const ffmpegCommand = `ffmpeg -i ${videoPath} -vf "subtitles=${subtitlesPath}:force_style='Fontfile=${fullFontPath}'" ${outputPath}`;

  const ffmpegProcess = exec(ffmpegCommand);

  ffmpegProcess.on('error', (error) => {
    console.error(`Error: ${error.message}`);
    // Handle error
    processNextEncoding(); // Continue with the next encoding request
  });

  ffmpegProcess.on('exit', () => {
    // Send email with download link
    const downloadLink = `http://${req.hostname}:${port}/uploads/${path.basename(outputPath)}`;
    sendEmail(userEmail, downloadLink);

    // Delete processed video after 24 hours
    setTimeout(() => {
      fs.unlink(outputPath, (err) => {
        if (err) {
          console.error(`Error deleting file: ${err}`);
        } else {
          console.log('Processed video deleted successfully after 24 hours.');
        }
      });
    }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds

    // Continue with the next encoding request
    processNextEncoding();
  });
}

// Your existing routes
app.get('/services', (req, res) => {
  res.sendFile(__dirname + '/public/services.html');
});

app.get('/contact', (req, res) => {
  res.sendFile(__dirname + '/public/contact.html');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});
