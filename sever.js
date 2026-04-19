const express = require('express');
const axios = require('axios');
const app = express();

// In-memory storage for user profiles (temporary)
const userProfiles = {};

// Retrieve secrets from environment variables
const CLIENT_ID     = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI  = process.env.REDIRECT_URI;

// Health-check / landing page so Render sees a 200 on '/'
app.get('/', (req, res) => {
  res.send('✅ Google-Auth server is running');
});

// OAuth callback (called by Google after login)
app.get('/auth/google/callback', async (req, res) => {
  const authCode = req.query.code;
  const state    = req.query.state;

  if (!authCode || !state) {
    return res.status(400).send('Missing authorization code or state parameter.');
  }

  try {
    // ✅ FIX: Send params in the POST body as x-www-form-urlencoded, not as query params
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code:          authCode,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const { access_token } = tokenResponse.data;

    // Fetch user profile from Google
    const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    // Save profile in memory keyed by state
    userProfiles[state] = userResponse.data;

    // ✅ Redirect user back to Unity using deep link
    const deepLink = `mygame://auth?state=${state}`;
    res.redirect(deepLink);

  } catch (error) {
    // ✅ FIX: Log Google's actual error response instead of the raw Axios object
    console.error('Token exchange failed:', error.response?.data || error.message);
    res.status(500).send('Authentication failed.');
  }
});

// Endpoint for Unity to retrieve the profile data by state
app.get('/getProfile', (req, res) => {
  const state = req.query.state;

  if (state && userProfiles[state]) {
    const profile = userProfiles[state];
    delete userProfiles[state]; // Clear memory
    res.json(profile);
  } else {
    res.status(404).send('Profile not found.');
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});

// ✅ FIX: Keep-alive ping every 14 minutes to prevent Render free-tier cold starts
const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(() => {
  axios.get(SELF_URL).catch(() => {}); // Silent fail is intentional
}, 14 * 60 * 1000);