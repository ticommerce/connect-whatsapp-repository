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

// Generar QR Code
client.on('qr', async (qr) => {
  try {
    console.log('QR Code recibido');
    qrCodeData = await qrcode.toDataURL(qr);
  } catch (error) {
    console.error('Error generando QR:', error);
  }
});

// Cliente conectado
client.on('ready', () => {
  console.log('WhatsApp conectado!');
  isConnected = true;
  phoneNumber = client.info?.wid?.user || 'Desconocido';
});

// Cliente desconectado
client.on('disconnected', () => {
  console.log('WhatsApp desconectado');
  isConnected = false;
  phoneNumber = null;
  qrCodeData = null;
});

// Manejar mensajes entrantes
client.on('message', async (message) => {
  try {
    // Ignorar mensajes propios y de grupos
    if (message.fromMe || message.from.includes('@g.us')) {
      return;
    }

    console.log('Mensaje recibido de:', message.from);
    
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) {
      console.error('WEBHOOK_URL no configurado');
      return;
    }

    // Llamar al webhook sin esperar respuesta (fire and forget)
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: message.from,
        name: message._data.notifyName || 'Sin nombre',
        message: message.body,
        timestamp: new Date().toISOString()
      })
    }).then(response => response.json())
      .then(result => console.log('Webhook OK'))
      .catch(error => console.error('Error webhook:', error.message));

  } catch (error) {
    console.error('Error procesando mensaje:', error);
  }
});

// Endpoints HTTP
app.get('/', (req, res) => {
  res.json({ status: 'OK', connected: isConnected });
});

app.get('/status', (req, res) => {
  res.json({ 
    connected: isConnected,
    phoneNumber: phoneNumber 
  });
});

app.get('/qr', (req, res) => {
  if (isConnected) {
    return res.json({ error: 'Ya está conectado' });
  }
  if (!qrCodeData) {
    return res.json({ error: 'QR no disponible aún, espera...' });
  }
  res.json({ qr: qrCodeData });
});

app.post('/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!isConnected) {
      return res.status(503).json({ error: 'WhatsApp no conectado' });
    }

    const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
    await client.sendMessage(chatId, message);
    
    console.log('Mensaje enviado a:', phone);
    res.json({ success: true });
  } catch (error) {
    console.error('Error al enviar mensaje:', error);
    res.status(500).json({ error: error.message });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  client.initialize();
});

// Manejar errores no capturados
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
