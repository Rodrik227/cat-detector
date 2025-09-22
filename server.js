// server.js - Versão Ubuntu Server
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const { spawn, exec } = require('child_process');
const fs = require('fs');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

let clients = new Set();
let videoClients = new Set();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });
  const videoWss = new WebSocketServer({ noServer: true });

  // Conexões WebSocket (igual)
  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('Cliente conectado (cliques). Total:', clients.size);
    ws.on('close', () => {
      clients.delete(ws);
      console.log('Cliente desconectado (cliques). Total:', clients.size);
    });
  });

  videoWss.on('connection', (ws) => {
    videoClients.add(ws);
    console.log('Cliente conectado (vídeo). Total:', videoClients.size);
    ws.on('close', () => {
      videoClients.delete(ws);
      console.log('Cliente desconectado (vídeo). Total:', videoClients.size);
    });
  });

  // NOVA: Detecção de cliques para Linux
let usbDetected = false;
let resetTimeout = null;
function resetUSBDetection() {
  console.log('✓ Sistema resetado - voltando a procurar conexões USB');
  usbDetected = false;
  
  const resetData = {
    timestamp: new Date().toISOString(),
    type: 'detection_reset',
    message: 'Sistema voltou a procurar conexões USB'
  };

  clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(resetData));
    }
  });
}

function startUSBDetection() {
  console.log('🔌 Monitorando conexões USB de dispositivos...');
  
  // Monitorar mudanças no diretório /dev/input
  const inputDir = '/dev/input';
  let previousDevices = new Set();
  
  // Capturar estado inicial
  try {
    const currentDevices = fs.readdirSync(inputDir).filter(file => file.startsWith('event'));
    previousDevices = new Set(currentDevices);
    console.log('📋 Dispositivos iniciais:', Array.from(previousDevices));
  } catch (error) {
    console.error('❌ Erro ao ler diretório /dev/input:', error.message);
  }

  // Verificar mudanças a cada 1 segundo
  setInterval(() => {
    if (usbDetected) return;
    
    try {
      const currentDevices = fs.readdirSync(inputDir).filter(file => file.startsWith('event'));
      const currentSet = new Set(currentDevices);
      
      // Verificar se há novos dispositivos
      const newDevices = [...currentSet].filter(device => !previousDevices.has(device));
      
      if (newDevices.length > 0) {
        console.log('🔌 Novos dispositivos detectados:', newDevices);
        
        // Verificar se algum é mouse usando udevadm
        newDevices.forEach(device => {
          const devicePath = `/dev/input/${device}`;
          
          exec(`udevadm info --query=property ${devicePath}`, (error, stdout) => {
            if (!error && !usbDetected) {
              // Verificar se é dispositivo de mouse ou pointer
              if (stdout.includes('ID_INPUT_MOUSE=1') || 
                  stdout.includes('ID_INPUT_POINTINGSTICK=1') ||
                  stdout.includes('mouse') ||
                  stdout.includes('Mouse')) {
                
                usbDetected = true;
                
                const usbData = {
                  timestamp: new Date().toISOString(),
                  type: 'mouse_click',  // Manter mesmo tipo para compatibilidade
                  button: 'left',
                  device: device,
                  message: `Mouse conectado em ${devicePath}`
                };

                clients.forEach(client => {
                  if (client.readyState === 1) {
                    client.send(JSON.stringify(usbData));
                  }
                });

                console.log(`🖱️ MOUSE USB CONECTADO! Dispositivo: ${device} - Pausando por 10 segundos...`);
                
                if (resetTimeout) clearTimeout(resetTimeout);
                resetTimeout = setTimeout(resetUSBDetection, 10000);
              }
            }
          });
        });
      }
      
      previousDevices = currentSet;
      
    } catch (error) {
      console.error('❌ Erro ao monitorar USB:', error.message);
    }
  }, 1000);
}

  // NOVA: Streaming de vídeo para Linux
  function startVideoStreaming() {
    console.log('📹 Iniciando streaming da webcam (Linux)...');
    
    const ffmpeg = spawn('ffmpeg', [
      '-f', 'v4l2',                   // Video4Linux2
      '-i', '/dev/video0',            // Primeira webcam
      '-f', 'mjpeg',
      '-r', '15',
      '-s', '640x480',
      '-q:v', '5',
      '-nostdin',
      '-loglevel', 'error',
      'pipe:1'
    ]);

    let streamingStarted = false;

    ffmpeg.stdout.on('data', (data) => {
      if (!streamingStarted) {
        console.log('✓ Webcam conectada e transmitindo');
        streamingStarted = true;
      }
      
      videoClients.forEach(client => {
        if (client.readyState === 1) {
          client.send(data);
        }
      });
    });

    ffmpeg.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message.includes('No such file or directory')) {
        console.error('❌ Webcam não encontrada em /dev/video0');
        console.log('💡 Liste webcams com: ls /dev/video*');
      } else if (message.includes('Permission denied')) {
        console.error('❌ Permissão negada para acessar webcam');
        console.log('💡 Execute: sudo usermod -a -G video $USER');
      }
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        console.log('⚠️ Webcam desconectada, tentando reconectar...');
        setTimeout(startVideoStreaming, 5000);
      }
    });
  }

  // Configurar upgrade para WebSocket (igual)
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url);
    
    if (pathname === '/api/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (pathname === '/api/video') {
      videoWss.handleUpgrade(request, socket, head, (ws) => {
        videoWss.emit('connection', ws, request);
      });
    } else if (pathname === '/_next/webpack-hmr') {
      app.getUpgradeHandler()(request, socket, head);
    }
  });

  startUSBDetection();
  startVideoStreaming();

  server.listen(3000, (err) => {
    if (err) throw err;
    console.log('🚀 Servidor rodando em http://localhost:3000');
    console.log('🔌 WebSocket (cliques): ws://localhost:3000/api/ws');
    console.log('📹 WebSocket (vídeo): ws://localhost:3000/api/video');
    console.log('🐧 Executando no Ubuntu Server');
    console.log('\n--- Sistema iniciado ---');
  });
});
