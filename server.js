const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');

const app = express();
app.use(express.json());

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  }
});

let qrCodeData = null;
let isConnected = false;
let phoneNumber = null;

client.on('qr', async (qr) => {
  console.log('QR recibido');
  qrCodeData = await qrcode.toDataURL(qr);
});

client.on('ready', () => {
  console.log('Conectado');
  isConnected = true;
  phoneNumber = client.info?.wid?.user || 'Unknown';
});

client.on('disconnected', () => {
  console.log('Desconectado');
  isConnected = false;
  phoneNumber = null;
  qrCodeData = null;
});

client.on('message', async (message) => {
  if (message.fromMe || message.from.includes('@g.us')) return;

  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) return;

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: message.from,
      name: message._data.notifyName || 'Sin nombre',
      message: message.body,
      timestamp: new Date().toISOString()
    })
  }).catch(e => console.error('Webhook error:', e.message));
});

app.get('/', (req, res) => res.json({ ok: true }));

app.get('/status', (req, res) => {
  res.json({ connected: isConnected, phoneNumber: phoneNumber });
});

app.get('/qr', (req, res) => {
  if (isConnected) return res.json({ error: 'Ya conectado' });
  if (!qrCodeData) return res.json({ error: 'QR no disponible' });
  res.json({ qr: qrCodeData });
});

app.post('/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!isConnected) return res.status(503).json({ error: 'No conectado' });
    
    const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
    await client.sendMessage(chatId, message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server on ${PORT}`);
  client.initialize();
});
