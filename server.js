// server.js - Versão Ubuntu Server
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
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
  let clickDetected = false;
  let resetTimeout = null;
  
  function resetClickDetection() {
    console.log('✓ Sistema resetado - voltando a procurar cliques');
    clickDetected = false;
    
    const resetData = {
      timestamp: new Date().toISOString(),
      type: 'detection_reset',
      message: 'Sistema voltou a procurar cliques'
    };

    clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(resetData));
      }
    });
  }
  
  function startClickDetection() {
    try {
      // Detectar dispositivo do mouse automaticamente
      const inputDevices = fs.readdirSync('/dev/input/');
      const mouseDevice = inputDevices.find(device => 
        device.startsWith('event') && 
        fs.existsSync(`/dev/input/${device}`)
      );
      
      if (!mouseDevice) {
        console.error('❌ Nenhum dispositivo de mouse encontrado');
        return;
      }
      
      const devicePath = `/dev/input/${mouseDevice}`;
      console.log(`🖱️ Monitorando mouse: ${devicePath}`);
      
      const mouseStream = fs.createReadStream(devicePath);
      
      mouseStream.on('data', (buffer) => {
        for (let i = 0; i < buffer.length; i += 24) {
          const type = buffer.readUInt16LE(i + 16);
          const code = buffer.readUInt16LE(i + 18);
          const value = buffer.readInt32LE(i + 20);
          
          // EV_KEY = 1, BTN_LEFT = 272, pressed = 1
          if (type === 1 && code === 272 && value === 1 && !clickDetected) {
            clickDetected = true;
            
            const clickData = {
              timestamp: new Date().toISOString(),
              type: 'mouse_click',
              button: 'left'
            };

            clients.forEach(client => {
              if (client.readyState === 1) {
                client.send(JSON.stringify(clickData));
              }
            });

            console.log('🖱️ CLIQUE DETECTADO! Pausando por 10 segundos...');
            
            if (resetTimeout) clearTimeout(resetTimeout);
            resetTimeout = setTimeout(resetClickDetection, 10000);
          }
        }
      });
      
      mouseStream.on('error', (err) => {
        console.error('❌ Erro ao ler mouse:', err.message);
        console.log('💡 Execute como: sudo node server.js');
      });
      
    } catch (error) {
      console.error('❌ Erro ao inicializar detecção de mouse:', error.message);
    }
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

  startClickDetection();
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
