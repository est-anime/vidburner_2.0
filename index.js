const express = require('express');
const fileUpload = require('express-fileupload');
const { exec } = require('child_process');
const fs = require('fs');
const { MongoClient } = require('mongodb');
const readline = require('readline');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto'); // For generating unique filename
const bcrypt = require('bcrypt');
const session = require('express-session');
const mongoose = require('mongoose');
const User = require('./models/User');
const { isAuthenticated } = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 3000;

app.use(fileUpload());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false
}));

// MongoDB Atlas connection URI
const uri = 'mongodb+srv://vpsest:AGdWW4NiuKCyB2tz@burner.y3sscsv.mongodb.net/?retryWrites=true&w=majority&appName=burner'; // Replace with your MongoDB Atlas connection string

mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected successfully to MongoDB Atlas'))
  .catch(err => console.error('Failed to connect to MongoDB Atlas:', err));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/services', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'services.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).send('Please fill in all fields.');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ email, password: hashedPassword });

  try {
    await user.save();
    res.redirect('/login');
  } catch (error) {
    res.status(400).send('User already exists.');
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log(`Login attempt with email: ${email}`);

  try {
    const user = await User.findOne({ email });

    if (!user) {
      console.log(`User with email ${email} not found.`);
      return res.status(400).send('Invalid credentials.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      console.log(`Invalid password for email: ${email}`);
      return res.status(400).send('Invalid credentials.');
    }

    req.session.userId = user._id;
    res.redirect('/dashboard');
  } catch (error) {
    console.error(`Login error: ${error.message}`);
    res.status(500).send('Login failed. Please try again later.');
  }
});

app.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

app.get('/burn', isAuthenticated, (req, res) => {
  res.sendFile(__dirname + '/public/burn.html');
});

app.get('/api/encoding-history', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    res.status(200).json({ history: user.encodingHistory });
  } catch (error) {
    console.error(`Error fetching encoding history: ${error}`);
    res.status(500).send('Error fetching encoding history.');
  }
});

app.post('/upload', isAuthenticated, async (req, res) => {
  if (!req.files || !req.files.video || !req.files.subtitles) {
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
  const logoPath = logoFile ? path.join(__dirname, `/uploads/logo_${uniqueId}.png`) : null;
  const outputPath = path.join(__dirname, '/uploads', outputFileName);

  try {
    await videoFile.mv(videoPath);
    await subtitlesFile.mv(subtitlesPath);
    if (logoFile) {
      await logoFile.mv(logoPath);
      await processVideoWithLogo();
    } else {
      await processVideoWithoutLogo();
    }

    res.send('Video processing started. You will receive an email once it is completed.');
  } catch (err) {
    console.error(`Error: ${err.message}`);
    res.status(500).send('Error occurred during file upload or processing.');
  }
});

const processVideoWithLogo = async () => {
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

  await executeFfmpeg(ffmpegCommand);
};

const processVideoWithoutLogo = async () => {
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

  await executeFfmpeg(ffmpegCommand);
};

const executeFfmpeg = (command) => {
  return new Promise((resolve, reject) => {
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
      reject(new Error('Error occurred during video processing.'));
    });

    ffmpegProcess.on('exit', async () => {
      try {
        res.write('data: 100\n\n');
        res.end();

        // Save the encoding history to the database
        const user = await User.findById(req.session.userId);
        user.encodingHistory.push({
          video: videoFile.name,
          subtitles: subtitlesFile.name,
          logo: logoFile ? logoFile.name : null,
          outputFileName,
          encodedAt: new Date(),
          downloadLink: `/uploads/${outputFileName}`
        });
        await user.save();

        // Construct the download link
        const downloadLink = `http://${req.hostname}/uploads/${outputFileName}`;

        // Send an email with the download link
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false, // true for 465, false for other ports
          auth: {
            user: process.env.Email,
            pass: process.env.APP_KEY,
          },
        });

        const mailOptions = {
          from: process.env.Email,
          to: userEmail,
          subject: 'Video Encoding Completed',
          text: `Your video has been successfully encoded. You can download it using the following link: ${downloadLink}`,
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error(`Email sending error: ${error}`);
          } else {
            console.log(`Email sent: ${info.response}`);
          }
        });

        // Delete the processed video after 24 hours
        setTimeout(() => {
          fs.unlink(outputPath, (err) => {
            if (err) {
              console.error(`Error deleting file: ${err}`);
            } else {
              console.log('Processed video deleted successfully after 24 hours.');
            }
          });
        }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
};

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});
