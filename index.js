const express = require('express');
const fileUpload = require('express-fileupload');
const { exec } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const nodemailer = require('nodemailer');
const path = require('path');
const Bull = require('bull');

const app = express();
const port = process.env.PORT || 3000;

// Create a new queue
const videoQueue = new Bull('videoQueue', {
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
});

app.use(fileUpload());
app.use('/uploads', express.static(__dirname + '/uploads'));
app.use(express.static(__dirname + '/public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

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

  // Calculate queue time
  const queueTime = await calculateQueueTime();

  const videoPath = path.join(__dirname, 'uploads', `${Date.now()}_video.mp4`);
  const subtitlesPath = path.join(__dirname, 'uploads', `${Date.now()}_subtitles.srt`);
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

      // Add job to the queue
      videoQueue.add({
        videoPath,
        subtitlesPath,
        selectedFont,
        outputPath,
        userEmail,
      });

      res.send(`Your video is in the queue. Estimated queue time: ${queueTime} seconds.`);
    });
  });
});

// Function to calculate queue time
async function calculateQueueTime() {
  const jobs = await videoQueue.getJobs(['waiting', 'active']);
  let queueTime = 0;

  // Calculate expected processing time for existing jobs
  jobs.forEach((job) => {
    const processingTime = job.data.processingTime || 600; // Default processing time 10 minutes
    queueTime += processingTime;
  });

  return queueTime;
}

// Process the queue
videoQueue.process(async (job, done) => {
  const { videoPath, subtitlesPath, selectedFont, outputPath, userEmail } = job.data;

  const fontMapping = {
    'Arial-Bold': 'Arial-Bold.ttf',
    'Juventus Fans Bold': 'Juventus-Fans-Bold.ttf',
    'Tungsten-Bold': 'Tungsten-Bold.ttf',
  };

  const selectedFontFile = fontMapping[selectedFont];

  if (!selectedFontFile) {
    return done(new Error('Selected font is not supported.'));
  }

  const fullFontPath = `fonts/${selectedFontFile}`;
  const ffmpegCommand = `ffmpeg -i ${videoPath} -vf "subtitles=${subtitlesPath}:force_style='Fontfile=${fullFontPath}'" ${outputPath}`;

  exec(ffmpegCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return done(new Error('Error occurred during video processing.'));
    }

    // Send an email with the download link
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // Set to true if using port 465 (secure)
      auth: {
        user: 'vpsest@gmail.com',
        pass: process.env.APP_KEY,
      },
    });

    const mailOptions = {
      from: 'vpsest@gmail.com',
      to: userEmail,
      subject: 'Video Encoding Completed',
      text: `Your video has been successfully encoded. You can download it using the following link: http://vidburner.vpsest.repl.co/uploads/${path.basename(outputPath)}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error(`Email sending error: ${error}`);
      } else {
        console.log(`Email sent: ${info.response}`);
      }
    });

    done();
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});
