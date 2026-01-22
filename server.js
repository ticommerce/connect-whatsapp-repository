const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.status(200).send('OK'));

let client;
let qrCodeData = null;
let isConnected = false;
let phoneNumber = null;
let isInitializing = false;

function initializeClient() {
  if (isInitializing) return;
  isInitializing = true;

  client = new Client({
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

  client.on('qr', async (qr) => {
    console.log('QR generado');
    qrCodeData = await qrcode.toDataURL(qr);
    isConnected = false;
  });

  client.on('ready', () => {
    console.log('Conectado exitosamente');
    isConnected = true;
    phoneNumber = client.info?.wid?.user || 'Unknown';
    isInitializing = false;
  });

  client.on('authenticated', () => {
    console.log('Autenticado');
  });

  client.on('auth_failure', () => {
    console.log('Fallo autenticación');
    isConnected = false;
    qrCodeData = null;
    isInitializing = false;
  });

  client.on('disconnected', (reason) => {
    console.log('Desconectado:', reason);
    isConnected = false;
    phoneNumber = null;
    qrCodeData = null;
    isInitializing = false;
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

  // Esperar antes de inicializar
  setTimeout(() => {
    client.initialize().catch(err => {
      console.error('Error al inicializar:', err);
      isInitializing = false;
    });
  }, 2000);
}

app.get('/', (req, res) => res.json({ ok: true }));

app.get('/status', (req, res) => {
  res.json({ connected: isConnected, phoneNumber });
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
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server on ${PORT}`);
  initializeClient();
});

process.on('SIGTERM', () => {
  console.log('SIGTERM recibido');
  server.close(() => {
    if (client) client.destroy();
    process.exit(0);
  });
}); 
