const express = require('express');
const fileUpload = require('express-fileupload');
const { exec } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const nodemailer = require('nodemailer');
const path = require('path');
const crypto = require('crypto'); // For generating unique filenames
const google = require('googleapis');

const app = express();
const port = process.env.PORT || 3000;

app.use(fileUpload());
app.use(express.json({ limit: '500mb' }));  // Increase limit as needed
app.use(express.urlencoded({ limit: '500mb', extended: true }));  // Increase limit as needed

app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/services', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'services.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

// Route to handle sign-in
app.post('/signin', (req, res) => {
  // Process the sign-in request here
  const idToken = req.body.id_token;

  // For now, let's just send a response indicating success
  res.status(200).json({ success: true, message: 'Sign-in successful' });
});

app.post('/upload', (req, res) => {
  if (!req.files ||!req.files.video ||!req.files.subtitles) {
    return res.status(400).send('Please upload both video and subtitles.');
  }

  const videoFile = req.files.video;
  const subtitlesFile = req.files.subtitles;
  const selectedFont = req.body.font || 'Arial-Bold';
  const outputFileName = req.body.outputFileName || 'output.mp4';
  const userEmail = req.body.email;
  const logoFile = req.files.logo;

  // Generate unique filenames for the uploaded files
  const uniqueId = crypto.randomBytes(16).toString('hex');
  const videoPath = path.join(__dirname, `/uploads/video_${uniqueId}.mp4`);
  const subtitlesPath = path.join(__dirname, `/uploads/subtitles_${uniqueId}.srt`);
  const logoPath = logoFile? path.join(__dirname, `/uploads/logo_${uniqueId}.png`) : null;
  const outputPath = path.join(__dirname, '/uploads', outputFileName);

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

      if (logoFile) {
        logoFile.mv(logoPath, (err) => {
          if (err) {
            console.error(`Error: ${err.message}`);
            return res.status(500).send('Error occurred while uploading the logo.');
          }
          processVideoWithLogo();
        });
      } else {
        processVideoWithoutLogo();
      }
    });
  });

  const processVideoWithLogo = () => {
    const fontMapping = {
      'Arial-Bold': 'Arial-Bold.ttf',
      'Juventus Fans Bold': 'Juventus-Fans-Bold.ttf',
      'Tungsten-Bold': 'Tungsten-Bold.ttf'
    };

    const selectedFontFile = fontMapping[selectedFont];

    if (!selectedFontFile) {
      return res.status(400).send('Selected font is not supported.');
    }

    const fullFontPath = path.join(__dirname, 'fonts', selectedFontFile);

    const subtitlesExtension = path.extname(subtitlesFile.name).toLowerCase();
    const acceptedSubtitleFormats = ['.srt', '.ass'];

    if (!acceptedSubtitleFormats.includes(subtitlesExtension)) {
      return res.status(400).send('Selected subtitle format is not supported.');
    }

    const ffmpegCommand = `ffmpeg -i "${videoPath}" -i "${logoPath}" -filter_complex "[1][0]scale2ref=w=iw/5:h=ow/mdar[logo][video];[video][logo]overlay=W-w-10:10,subtitles=${subtitlesPath}:force_style='FontName=${fullFontPath}'" "${outputPath}"`;
 
    executeFfmpeg(ffmpegCommand);
  };

  const processVideoWithoutLogo = () => {
    const fontMapping = {
      'Arial-Bold': 'Arial-Bold.ttf',
      'Juventus Fans Bold': 'Juventus-Fans-Bold.ttf',
      'Tungsten-Bold': 'Tungsten-Bold.ttf'
    };

    const selectedFontFile = fontMapping[selectedFont];

    if (!selectedFontFile) {
      return res.status(400).send('Selected font is not supported.');
    }

    const fullFontPath = path.join(__dirname, 'fonts', selectedFontFile);

    const subtitlesExtension = path.extname(subtitlesFile.name).toLowerCase();
    const acceptedSubtitleFormats = ['.srt', '.ass'];

    if (!acceptedSubtitleFormats.includes(subtitlesExtension)) {
      return res.status(400).send('Selected subtitle format is not supported.');
    }

    const ffmpegCommand = `ffmpeg -i "${videoPath}" -vf "subtitles=${subtitlesPath}:force_style='FontName=${fullFontPath}'" "${outputPath}"`;
    
    executeFfmpeg(ffmpegCommand);
  };

  const executeFfmpeg = (command) => {
    const ffmpegProcess = exec(command);

    let totalFrames = 0;
    let processedFrames = 0;
    readline.createInterface({ input: ffmpegProcess.stderr })
      .on('line', (line) => {
        if (line.includes('frame=')) {
          const match = line.match(/frame=\s*(\d+)/);
          if (match && match[1]) {
            processedFrames = parseInt(match[1]);
          }
        }
        if (line.includes('fps=')) {
          const match = line.match(/fps=\s*([\d.]+)/);
          if (match && match[1]) {
            totalFrames = parseInt(match[1]);
          }
        }
        if (totalFrames > 0 && processedFrames > 0) {
          const progressPercent = (processedFrames / totalFrames) * 100;
          res.write(`data: ${progressPercent}\n\n`);
        }
      });

    ffmpegProcess.on('error', (error) => {
      console.error(`Error: ${error.message}`);
      return res.status(500).send('Error occurred during video processing.');
    });

    ffmpegProcess.on('exit', () => {
      res.write('data: 100\n\n');
      res.end();

      // Authenticate with Google Drive using the access token
      authenticateWithGoogleDrive(userEmail, outputPath);
    });
  };
});

const authenticateWithGoogleDrive = (userEmail, outputPath) => {
  const auth = new google.auth.GoogleAuth({
    // If you have a JSON key file, use this:
    keyFile: 'root/vidburner_2.0/key/vidburner-c6c5d2c5488f.json',
    // If you have a service account email, use this:
    clientEmail: 'vid-363@vidburner.iam.gserviceaccount.com',
    scopes: ['https://www.googleapis.com/auth/drive']
  });

  const drive = google.drive('v3');

  auth.authorize((err, tokens) => {
    if (err) {
      console.error(`Error authenticating with Google Drive: ${err}`);
      return;
    }

    const accessToken = tokens.access_token;

    // Create a new folder named "Vidburner" if it doesn't exist
    createVidburnerFolder(accessToken, userEmail, outputPath);
  });
};

const createVidburnerFolder = (accessToken, userEmail, outputPath) => {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };

  const folderName = 'Vidburner';
  const folderMetadata = {
    'name': folderName,
    'mimeType': 'application/vnd.google-apps.folder'
  };

  fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(folderMetadata)
  })
  .then(response => response.json())
  .then(data => {
    console.log(`Folder created: ${data.name}`);
    // Upload the encoded video to the "Vidburner" folder
    uploadVideoToGoogleDrive(accessToken, data.id, outputPath);
  })
  .catch(error => console.error(`Error creating folder: ${error}`));
};

const uploadVideoToGoogleDrive = (accessToken, folderId, outputPath) => {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'video/mp4'
  };

  const videoFile = fs.readFileSync(outputPath);
  const uploadMetadata = {
    'name': 'output.mp4',
    'mimeType': 'video/mp4',
    'parents': [folderId]
  };

  fetch('https://www.googleapis.com/upload/drive/v3/files', {
    method: 'POST',
    headers: headers,
    body: videoFile
  })
  .then(response => response.json())
  .then(data => {
    console.log(`Video uploaded: ${data.name}`);
  })
  .catch(error => console.error(`Error uploading video: ${error}`));
};

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});
