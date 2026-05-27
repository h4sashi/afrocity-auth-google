const express = require('express');
const axios = require('axios');
const app = express();

// In-memory storage for user profiles (temporary)
const userProfiles = {};

// Retrieve secrets from environment variables
const CLIENT_ID     = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI  = process.env.REDIRECT_URI;

// Simple timestamped logger helper
const log = (msg, obj) => {
  if (obj) {
    console.log(`[${new Date().toISOString()}] ${msg}`, obj);
  } else {
    console.log(`[${new Date().toISOString()}] ${msg}`);
  }
};

// Health‑check / landing page so Render sees a 200 on '/'
app.get('/', (req, res) => {
  res.send('✅ Google‑Auth server is running');
});

// OAuth callback (called by Google after login)
app.get('/auth/google/callback', async (req, res) => {
  const authCode = req.query.code;
  const state    = req.query.state;

  if (!authCode || !state) {
    return res.status(400).send('Missing authorization code or state parameter.');
  }

  try {
    log('OAuth callback received', { state, ip: req.ip });
    // Exchange authorization code for access token
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', null, {
      params: {
        code: authCode,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      },
    });

    const { access_token } = tokenResponse.data;

    // Fetch user profile from Google
    const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    // Save profile in memory keyed by state
    userProfiles[state] = userResponse.data;
    // Log basic non-sensitive profile info for debugging/monitoring
    log('Saved profile', {
      state,
      id: userResponse.data.id,
      email: userResponse.data.email,
      name: userResponse.data.name,
    });

    // ✅ Redirect user back to Unity using deep link
    const deepLink = `afrocity://auth?state=${state}`;
    res.redirect(deepLink);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error during authentication:`, error);
    res.status(500).send('Authentication failed.');
  }
});

// Endpoint for Unity to retrieve the profile data by state
app.get('/getProfile', (req, res) => {
  const state = req.query.state;

  log('Profile request received', { state, ip: req.ip });

  if (state && userProfiles[state]) {
    const profile = userProfiles[state];
    delete userProfiles[state]; // Clear memory
    log('Serving profile to requester', { state, id: profile.id, email: profile.email, name: profile.name });
    res.json(profile);
  } else {
    log('Profile not found for state', { state });
    res.status(404).send('Profile not found.');
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  log(`✅ Server is running on port ${PORT}`);
});
