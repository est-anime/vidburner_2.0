const express = require('express');
const fileUpload = require('express-fileupload');
const { exec } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const nodemailer = require('nodemailer');
const path = require('path');
const Bull = require('bull');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

app.use(fileUpload());

app.use('/uploads', express.static(__dirname + '/uploads'));

// Create a new Bull queue
const videoQueue = new Bull('videoProcessingQueue');

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Serve static files from the "public" directory
app.use(express.static(__dirname + '/public'));

app.get('/services', (req, res) => {
  res.sendFile(__dirname + '/public/services.html');
});

app.get('/contact', (req, res) => {
  res.sendFile(__dirname + '/public/contact.html');
});

app.post('/upload', async (req, res) => {
  if (!req.files || !req.files.video || !req.files.subtitles) {
    return res.status(400).send('Please upload both video and subtitles.');
  }

  const videoFile = req.files.video;
  const subtitlesFile = req.files.subtitles;
  const selectedFont = req.body.font || 'Arial-Bold';
  const outputFileName = req.body.outputFileName || 'output.mp4';
  const userEmail = req.body.email;

  const videoPath = __dirname + '/uploads/' + uuidv4() + '_video.mp4'; // Unique video filename
  const subtitlesPath = __dirname + '/uploads/' + uuidv4() + '_subtitles.srt'; // Unique subtitles filename
  const outputPath = path.join(__dirname, 'uploads', outputFileName);

  try {
    await videoFile.mv(videoPath);
    await subtitlesFile.mv(subtitlesPath);

    // Add video processing job to the queue
    await videoQueue.add('processVideo', {
      videoPath,
      subtitlesPath,
      outputPath,
      userEmail,
      selectedFont
    });

    res.send('Video processing job added to the queue.');
  } catch (error) {
    console.error('Error occurred while uploading files:', error);
    res.status(500).send('Error occurred while uploading files.');
  }
});

// Define video processing worker
videoQueue.process('processVideo', async (job) => {
  const { videoPath, subtitlesPath, outputPath, userEmail, selectedFont } = job.data;

  // Your video processing logic here...

  // Example:
   const ffmpegCommand = `ffmpeg -i ${videoPath} -vf "subtitles=${subtitlesPath}:force_style='Fontfile=${fullFontPath}'" ${outputPath}`;
   const ffmpegProcess = exec(ffmpegCommand);
   await new Promise((resolve, reject) => {
     ffmpegProcess.on('exit', (code) => {
       if (code === 0) {
         resolve();
       } else {
         reject(new Error('Video processing failed.'));
       }
     });
   });

  // Send email with download link
  const downloadLink = `http://${req.hostname}:${port}/uploads/${outputFileName}`;
  await sendEmail(userEmail, downloadLink);

  // Delete temporary files
  await deleteFiles([videoPath, subtitlesPath]);

  return downloadLink;
});

async function sendEmail(userEmail, downloadLink) {
  // Nodemailer configuration to send email
}

async function deleteFiles(filePaths) {
  // Logic to delete files
}

app.listen(port, () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});
