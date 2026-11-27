require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '4mb' }));

// Root route (fixes "Cannot GET /")
app.get('/', (req, res) => {
  res.send('DARKGPT Proxy Online');
});

// Health check (frontend "Running Online" pill)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Proxy endpoint
app.post('/proxy', async (req, res) => {
  try {
    const { provider, endpoint, model, apiKey, messages } = req.body;

    if (!endpoint || !apiKey || !messages) {
      return res.status(400).json({ error: 'Missing required fields: endpoint, apiKey, messages' });
    }

    const headers = { 'Content-Type': 'application/json' };

    if (provider === 'google') {
      headers['x-goog-apikey'] = apiKey;
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    let body;
    if (provider === 'google') {
      body = {
        contents: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }))
      };
    } else {
      // Force non-streaming for Kilo / OpenRouter / OpenAI-compatible
      body = { model, messages, max_tokens: 2048, stream: false };
    }

    const targetRes = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const contentType = targetRes.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
      data = await targetRes.json();
    } else {
      const text = await targetRes.text();
      try { data = JSON.parse(text); } catch { data = { text }; }
    }

    res.status(targetRes.status).json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: err.message || 'Proxy failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[DARKGPT] Proxy running on port ${PORT}`));
